/**
 * Environment Factors — ajusta o consumo previsto por variáveis que hoje
 * o motorista informa manualmente (clima, carga, vento) e que amanhã podem
 * vir de uma API de clima/elevação, sem trocar essa interface.
 *
 * Modelo v1: cada fator vira um multiplicador aplicado sobre o Wh/km já
 * calculado pelo PredictionEngine (rolamento + aero). Composição
 * multiplicativa simples, documentada e limitada (clamp) para nunca
 * produzir previsão absurda. Todo input é opcional — default = sem
 * efeito (multiplicador 1, termo aditivo 0) — então nada quebra para
 * quem não preencheu nada.
 *
 * TS puro, zero React/DOM — mesmo padrão dos demais engines.
 */

export interface EnvironmentInput {
  outsideTempC?: number; // temperatura externa (°C)
  rain?: 'none' | 'light' | 'heavy';
  headwindKmh?: number; // positivo = vento contra, negativo = vento a favor
  extraWeightKg?: number; // passageiros/bagagem além do padrão de 1 pessoa
  roofCargo?: boolean; // bagageiro no teto (aumenta arrasto)
  towing?: boolean; // reboque
  climateOn?: boolean; // ar-condicionado ou aquecimento ligado
  climateIntensity?: 'low' | 'medium' | 'high';
  elevationGainM?: number; // subida acumulada no trecho (m)
  elevationLossM?: number; // descida acumulada no trecho (m)
}

export interface EnvironmentFactor {
  label: string;
  effectPct: number; // ex.: 8 significa +8% de consumo nesse fator
}

export interface EnvironmentResult {
  multiplier: number; // aplica direto sobre o Wh/km de rolamento+aero
  climateAddWhPerKm: number; // termo aditivo (climatização é carga fixa em kW, não escala com aero)
  factors: EnvironmentFactor[];
  active: boolean; // true se algum input foi informado (usado pelo Modo Confiança)
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

const TEMP_IDEAL_MIN = 18;
const TEMP_IDEAL_MAX = 26;

/** Vazio = sem efeito. Usado como default e para checar se há algo a considerar. */
export const NO_ENVIRONMENT_EFFECT: EnvironmentResult = { multiplier: 1, climateAddWhPerKm: 0, factors: [], active: false };

/**
 * Converte os inputs manuais num multiplicador + termo aditivo de consumo.
 * @param avgSpeedKmh usado só para o termo de climatização (carga fixa em kW → Wh/km depende da velocidade média)
 */
export function computeEnvironmentFactors(i: EnvironmentInput | undefined, avgSpeedKmh = 60): EnvironmentResult {
  if (!i) return NO_ENVIRONMENT_EFFECT;

  const factors: EnvironmentFactor[] = [];
  let multiplier = 1;
  let climateAddWhPerKm = 0;
  let active = false;

  // Temperatura: fora da faixa ideal, a bateria (resistência interna) e a
  // climatização pesam mais. Efeito calibrado por observações públicas de
  // frota (frio extremo pode custar >30% de autonomia; calor, menos).
  if (i.outsideTempC !== undefined) {
    active = true;
    if (i.outsideTempC < TEMP_IDEAL_MIN) {
      const deficit = TEMP_IDEAL_MIN - i.outsideTempC;
      const effect = clamp(deficit * 1.2, 0, 35);
      multiplier *= 1 + effect / 100;
      if (effect > 0) factors.push({ label: `Frio (${i.outsideTempC}°C)`, effectPct: round1(effect) });
    } else if (i.outsideTempC > TEMP_IDEAL_MAX) {
      const excess = i.outsideTempC - TEMP_IDEAL_MAX;
      const effect = clamp(excess * 0.8, 0, 20);
      multiplier *= 1 + effect / 100;
      if (effect > 0) factors.push({ label: `Calor (${i.outsideTempC}°C)`, effectPct: round1(effect) });
    }
  }

  // Chuva: piso molhado, faróis/limpador ligados, regen um pouco mais conservador.
  if (i.rain === 'light') {
    active = true;
    multiplier *= 1.05;
    factors.push({ label: 'Chuva leve', effectPct: 5 });
  } else if (i.rain === 'heavy') {
    active = true;
    multiplier *= 1.12;
    factors.push({ label: 'Chuva forte', effectPct: 12 });
  }

  // Vento: componente de proa/popa entra quase linear no arrasto na faixa usual de rodovia.
  if (i.headwindKmh) {
    active = true;
    const effect = clamp(i.headwindKmh * 0.6, -25, 40);
    multiplier *= 1 + effect / 100;
    factors.push({ label: i.headwindKmh > 0 ? 'Vento contrário' : 'Vento a favor', effectPct: round1(effect) });
  }

  // Peso extra: ~1.5% de consumo a mais por 100kg em uso misto.
  if (i.extraWeightKg) {
    active = true;
    const effect = clamp((i.extraWeightKg / 100) * 1.5, 0, 15);
    multiplier *= 1 + effect / 100;
    factors.push({ label: `+${i.extraWeightKg}kg de carga`, effectPct: round1(effect) });
  }

  if (i.roofCargo) {
    active = true;
    multiplier *= 1.15;
    factors.push({ label: 'Bagageiro de teto', effectPct: 15 });
  }

  if (i.towing) {
    active = true;
    multiplier *= 1.45;
    factors.push({ label: 'Reboque', effectPct: 45 });
  }

  // Elevação: quem chama (EnergyHorizon) converte isso em Wh/km real por trecho;
  // aqui só registramos o fator informativo pro checklist de confiança.
  if (i.elevationGainM || i.elevationLossM) {
    active = true;
    const netM = (i.elevationGainM ?? 0) - 0.65 * (i.elevationLossM ?? 0); // descida devolve ~65% via regen
    if (netM > 5) factors.push({ label: `Subida líquida ${Math.round(netM)}m`, effectPct: 0 });
    else if (netM < -5) factors.push({ label: `Descida líquida ${Math.round(-netM)}m`, effectPct: 0 });
  }

  // Climatização: carga fixa em kW (independente da aerodinâmica), então em
  // Wh/km pesa mais parado no trânsito do que em rodovia — por isso é termo
  // aditivo dividido pela velocidade, não multiplicador.
  if (i.climateOn) {
    active = true;
    const kw = i.climateIntensity === 'high' ? 2.2 : i.climateIntensity === 'low' ? 0.8 : 1.4;
    climateAddWhPerKm = avgSpeedKmh > 3 ? (kw * 1000) / avgSpeedKmh : kw * 1000;
    factors.push({ label: 'Ar-condicionado/aquecimento', effectPct: round1((climateAddWhPerKm / 150) * 100) });
  }

  multiplier = clamp(multiplier, 0.7, 2.2); // nunca deixa a previsão explodir
  return { multiplier: round2(multiplier), climateAddWhPerKm: Math.round(climateAddWhPerKm), factors, active };
}
