import type { PidDefinition } from '../vehicle/drivers/types';

/**
 * Decodificador de respostas ELM327.
 * Usado pelas fontes reais (Web Bluetooth / app nativo). O simulador
 * não passa por aqui. Testável de forma isolada.
 *
 * Ex.: requisição "010D" → resposta "41 0D 3C" → speed = 0x3C = 60 km/h
 */
export function parseElmResponse(raw: string, def: PidDefinition): number | null {
  const clean = raw.replace(/[\s>\r\n]/g, '').toUpperCase();
  if (clean.includes('NODATA') || clean.length < 4) return null;

  // Resposta positiva: modo + 0x40. Ex.: modo 01 → prefixo 41
  const expectedPrefix =
    (parseInt(def.mode, 16) + 0x40).toString(16).padStart(2, '0').toUpperCase() +
    def.pid.toUpperCase();

  const idx = clean.indexOf(expectedPrefix);
  if (idx === -1) return null;

  const dataHex = clean.slice(idx + expectedPrefix.length);
  const bytes: number[] = [];
  for (let i = 0; i + 1 < dataHex.length && bytes.length < 4; i += 2) {
    bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  }
  if (bytes.length === 0) return null;

  return evaluateFormula(def.parse, bytes);
}

/** Avalia fórmulas simples do tipo 'A', '(A*256+B)/100', 'A*100/255'. */
function evaluateFormula(formula: string, bytes: number[]): number | null {
  const [A = 0, B = 0, C = 0, D = 0] = bytes;
  // Whitelist estrita: apenas letras A-D, dígitos, operadores e parênteses.
  if (!/^[ABCD0-9+\-*/(). ]+$/.test(formula)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('A', 'B', 'C', 'D', `return (${formula});`);
    const result = fn(A, B, C, D);
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
