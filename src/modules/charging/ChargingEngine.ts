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
