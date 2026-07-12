/**
 * Charging Engine — decide ONDE carregar, nao lista pinos no mapa.
 *
 * Fonte v1: OpenChargeMap (localizacao, potencia, operador, status).
 * ⚠️ Preco, fila e avaliacoes NAO existem em API publica no Brasil —
 * o score ja tem os campos; eles entram via parceria comercial depois.
 * Falha de rede degrada com elegancia: retorna lista vazia, nunca trava.
 */

import { haversineKm, type LatLng } from '../navigation/geo';

export interface Charger {
  id: string;
  name: string;
  operator: string;
  lat: number;
  lng: number;
  powerKw: number;
  distanceKm: number;       // ate o ponto de referencia
  detourMin: number;        // desvio estimado ida+volta
  chargeMinTo80: number;    // tempo estimado de carga ate 80%
  score: number;            // maior = melhor escolha
  // Campos aguardando fonte de dados real (parceria):
  priceBrlKwh: number | null;
  queueMin: number | null;
  reliabilityPct: number | null;
}

const OCM = 'https://api.openchargemap.io/v3/poi/';

/**
 * A OpenChargeMap exige chave de API (gratuita: openchargemap.org/site/develop).
 * A chave e colada UMA vez no app (localStorage) — sem redeploy:
 *   localStorage.setItem('encorpei-auto:ocm-key', 'SUA_CHAVE')
 */
export function ocmKey(): string | null {
  try { return localStorage.getItem('encorpei-auto:ocm-key'); } catch { return null; }
}

export async function findChargers(near: LatLng, radiusKm = 25, maxResults = 12): Promise<Charger[]> {
  try {
    const key = ocmKey();
    if (!key) return []; // sem chave: degrada em silencio (UI mostra aviso)
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const url = OCM + '?output=json&key=' + encodeURIComponent(key) + '&countrycode=BR&latitude=' + near.lat + '&longitude=' + near.lng +
      '&distance=' + radiusKm + '&distanceunit=KM&maxresults=' + maxResults * 2 + '&compact=true&verbose=false';
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return [];
    const j = await r.json();
    if (!Array.isArray(j)) return [];

    const out: Charger[] = [];
    for (const poi of j) {
      const info = poi.AddressInfo;
      if (!info?.Latitude || !info?.Longitude) continue;
      const conns = poi.Connections ?? [];
      const powerKw = Math.max(0, ...conns.map((c: any) => c?.PowerKW ?? 0));
      const operational = poi.StatusTypeID === undefined || poi.StatusTypeID === null || poi.StatusTypeID === 50;
      if (!operational) continue;
      const pos = { lat: info.Latitude, lng: info.Longitude };
      const distanceKm = haversineKm(near, pos);
      out.push({
        id: String(poi.ID),
        name: info.Title ?? 'Carregador',
        operator: poi.OperatorInfo?.Title ?? 'Operador não informado',
        lat: pos.lat,
        lng: pos.lng,
        powerKw: powerKw || 22,
        distanceKm,
        detourMin: Math.round((distanceKm * 1.3 / 40) * 60 * 2), // ida+volta a 40 km/h urbano
        chargeMinTo80: estimateChargeMin(powerKw || 22),
        score: 0,
        priceBrlKwh: null,
        queueMin: null,
        reliabilityPct: null,
      });
    }
    return rank(out).slice(0, maxResults);
  } catch {
    return [];
  }
}

/** Tempo estimado (min) para levar ~50% de SOC num pack de 60 kWh. */
function estimateChargeMin(powerKw: number): number {
  const effective = powerKw >= 50 ? powerKw * 0.85 : powerKw * 0.9;
  return Math.round((30 / effective) * 60); // ~30 kWh
}

/**
 * Score = tempo total perdido (desvio + carga), potencia como desempate.
 * Quando preco/fila/confiabilidade chegarem, entram aqui — a UI nao muda.
 */
export function rank(chargers: Charger[]): Charger[] {
  for (const c of chargers) {
    const timeLost = c.detourMin + c.chargeMinTo80 + (c.queueMin ?? 0);
    let score = 1000 - timeLost * 6;
    score += Math.min(150, c.powerKw);           // potencia ajuda
    if (c.priceBrlKwh !== null) score -= c.priceBrlKwh * 40;
    if (c.reliabilityPct !== null) score += (c.reliabilityPct - 90) * 4;
    c.score = Math.round(score);
  }
  return chargers.sort((a, b) => b.score - a.score);
}

/** Melhor parada quando a chegada nao fecha: procura perto do ponto da rota onde o SOC ~ reserva. */
export function pickStopPoint(routeCoord: LatLng): LatLng { return routeCoord; }

// ============================================================================
// Planejamento de PARADA — a timeline energetica ganha o "onde e quanto".
// ============================================================================

import { pointAhead } from '../navigation/geo';
import type { RoutePlan } from '../navigation/NavigationEngine';

export interface ChargingStop {
  km: number;                 // km da rota onde parar
  coord: LatLng;
  socAtStopPct: number;       // soc previsto ao chegar na parada
  chargeToPct: number;        // "carregar ate X%"
  socAtArrivalPct: number;    // soc previsto no destino APOS a recarga
  chargeMin: number;          // tempo estimado de carga
  charger: Charger | null;    // null = sem base de carregadores (sem chave OCM)
}

/**
 * Decide onde parar e ate quanto carregar para chegar com a reserva intacta.
 * Sem carregador na base? Degrada com elegancia: devolve o PONTO da rota
 * ("carregador proximo ao km X") — a decisao continua clara pro motorista.
 */
export async function planChargingStop(
  plan: RoutePlan,
  socNowPct: number,
  avgWhPerKm: number,
  packKwh: number,
  reservePct = 10,
): Promise<ChargingStop | null> {
  if (packKwh <= 0 || plan.distanceKm <= 1) return null;
  const socPerKm = ((Math.max(80, avgWhPerKm) / 1000) / packKwh) * 100;
  const socAtArrivalDirect = socNowPct - plan.distanceKm * socPerKm;
  if (socAtArrivalDirect >= reservePct) return null; // chega sem parar

  // Para ANTES de encostar na reserva, com folga de 5%
  let stopKm = (socNowPct - (reservePct + 5)) / socPerKm;
  stopKm = Math.max(3, Math.min(plan.distanceKm - 3, stopKm));

  const coord = pointAhead(plan.geometry, plan.cumKm, 0, stopKm);
  const socAtStopPct = Math.max(0, Math.round(socNowPct - stopKm * socPerKm));
  const remainingKm = plan.distanceKm - stopKm;
  const chargeToPct = Math.min(90, Math.max(30, Math.round(reservePct + 8 + remainingKm * socPerKm)));
  const socAtArrivalPct = Math.max(0, Math.round(chargeToPct - remainingKm * socPerKm));

  const list = await findChargers(coord, 30, 8);
  const charger = list.find((c) => c.powerKw >= 30) ?? list[0] ?? null;
  const power = charger?.powerKw ?? 60;
  const effective = power >= 50 ? power * 0.85 : power * 0.9;
  const chargeMin = Math.max(5, Math.round((((chargeToPct - socAtStopPct) / 100) * packKwh / effective) * 60));

  return { km: Math.round(stopKm), coord, socAtStopPct, chargeToPct, socAtArrivalPct, chargeMin, charger };
}

