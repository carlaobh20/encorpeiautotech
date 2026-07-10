/** Decodificador ELM327 — mesmo algoritmo do PWA (src/modules/obd). */
export function parseElmResponse(raw, def) {
  const clean = String(raw).replace(/[\s>\r\n]/g, '').toUpperCase();
  if (clean.includes('NODATA') || clean.length < 4) return null;
  const prefix =
    (parseInt(def.mode, 16) + 0x40).toString(16).padStart(2, '0').toUpperCase() + def.pid.toUpperCase();
  const idx = clean.indexOf(prefix);
  if (idx === -1) return null;
  const dataHex = clean.slice(idx + prefix.length);
  const bytes = [];
  for (let i = 0; i + 1 < dataHex.length && bytes.length < 4; i += 2) {
    bytes.push(parseInt(dataHex.slice(i, i + 2), 16));
  }
  if (bytes.length === 0) return null;
  const [A = 0, B = 0, C = 0, D = 0] = bytes;
  if (!/^[ABCD0-9+\-*/(). ]+$/.test(def.parse)) return null;
  try {
    const fn = new Function('A', 'B', 'C', 'D', `return (${def.parse});`);
    const r = fn(A, B, C, D);
    return typeof r === 'number' && Number.isFinite(r) ? r : null;
  } catch {
    return null;
  }
}
