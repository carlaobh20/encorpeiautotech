/**
 * PredictionEngine — o cerebro do copiloto Encorpei Auto.
 *
 * Transforma ESTADO + ROTA em UMA resposta: "voce chega com X%".
 * Nao mostra sensores; produz decisao. Modelo v1 (rolamento + aero quadratico),
 * projetado pra ser refinado com dados reais (vento/elevacao/clima) sem quebrar a API.
 *
 * TS puro, zero React/DOM: roda igual no PWA hoje e no app nativo amanha.
 */

export interface PredictionInput {
  socPct: number;                    // SOC atual (0..100)
  packUsableKwh: number;             // capacidade util do pack (kWh)
  distanceRemainingKm: number;       // distancia ate o destino
  recentConsumptionWhPerKm: number;  // consumo recente medido (Wh/km)
  speedKmh: number;                  // velocidade atual
  reserveSocPct?: number;            // margem intocavel (default 10%)
}

export type PredictionStatus = 'ok' | 'tight' | 'insufficient';
export type Confidence = 'low' | 'medium' | 'high';

export interface Prediction {
  socAtArrivalPct: number;
  energyNeededKwh: number;
  energyAvailableKwh: number;
  etaMinutes: number | null;
  marginPct: number;                 // socAtArrival - reserva
  status: PredictionStatus;
  needsCharge: boolean;
  confidence: Confidence;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round = (v: number, d: number) => { const f = 10 ** d; return Math.round(v * f) / f; };

// Piso de sanidade: consumo abaixo disso e ruido de medicao, nao realidade.
const MIN_WH_PER_KM = 80;
// Modelo de consumo por velocidade: rolamento fixo + arrasto ~ v^2.
const ROLLING_WH_PER_KM = 95;

/** Consumo (Wh/km) projetado para uma velocidade alvo, ancorado no ponto observado. */
export function consumptionAtSpeed(observedWhPerKm: number, observedSpeedKmh: number, targetSpeedKmh: number): number {
  const obs = Math.max(MIN_WH_PER_KM, observedWhPerKm);
  if (observedSpeedKmh <= 5) return obs; // sem base aero confiavel
  const aeroK = Math.max(0, (obs - ROLLING_WH_PER_KM) / (observedSpeedKmh ** 2));
  return Math.max(MIN_WH_PER_KM, ROLLING_WH_PER_KM + aeroK * targetSpeedKmh ** 2);
}

export function predict(i: PredictionInput): Prediction {
  const reserve = i.reserveSocPct ?? 10;
  const consumption = Math.max(MIN_WH_PER_KM, i.recentConsumptionWhPerKm);
  const energyNeededKwh = (consumption * i.distanceRemainingKm) / 1000;
  const energyAvailableKwh = (i.socPct / 100) * i.packUsableKwh;
  const socUsedPct = i.packUsableKwh > 0 ? (energyNeededKwh / i.packUsableKwh) * 100 : 100;
  const socAtArrivalPct = clamp(i.socPct - socUsedPct, 0, 100);
  const marginPct = socAtArrivalPct - reserve;
  const etaMinutes = i.speedKmh > 3 ? (i.distanceRemainingKm / i.speedKmh) * 60 : null;

  let status: PredictionStatus = 'ok';
  if (socAtArrivalPct <= reserve / 2) status = 'insufficient';
  else if (marginPct < 0) status = 'tight';

  const confidence: Confidence =
    i.distanceRemainingKm < 5 ? 'high' : i.recentConsumptionWhPerKm > 0 ? 'medium' : 'low';

  return {
    socAtArrivalPct: round(socAtArrivalPct, 0),
    energyNeededKwh: round(energyNeededKwh, 1),
    energyAvailableKwh: round(energyAvailableKwh, 1),
    etaMinutes: etaMinutes !== null ? Math.round(etaMinutes) : null,
    marginPct: round(marginPct, 0),
    status,
    needsCharge: status === 'insufficient' || socAtArrivalPct < reserve,
    confidence,
  };
}

/** E se o usuario reduzir X km/h? Retorna o novo SOC de chegada (para o insight de coaching). */
export function socAtArrivalIfSlower(i: PredictionInput, deltaSpeedKmh: number): number {
  const target = Math.max(20, i.speedKmh - deltaSpeedKmh);
  const newConsumption = consumptionAtSpeed(i.recentConsumptionWhPerKm, i.speedKmh, target);
  return predict({ ...i, recentConsumptionWhPerKm: newConsumption }).socAtArrivalPct;
}
