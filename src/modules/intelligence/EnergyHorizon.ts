/**
 * Energy Horizon — a rota vira uma linha do tempo de energia.
 *
 * Dado o plano de rota + estado da bateria + consumo observado, produz:
 *  - marcos de SOC ao longo da rota (82% → 74% → ... → chegada 29%)
 *  - segmentos coloridos por eficiencia prevista (eco/normal/alto)
 *  - SOC previsto na chegada, coerente com o PredictionEngine
 *
 * Modelo v1: consumo por velocidade (rolamento + aero v²) ancorado no
 * consumo observado. Elevacao e vento entram depois SEM quebrar a API.
 */

import type { RoutePlan } from '../navigation/NavigationEngine';
import type { LatLng } from '../navigation/geo';
import { consumptionAtSpeed } from './PredictionEngine';

export type SegmentLevel = 'eco' | 'normal' | 'high';

export interface HorizonMilestone { km: number; socPct: number; coord: LatLng; isArrival: boolean; }
export interface HorizonSegment { fromIdx: number; toIdx: number; level: SegmentLevel; whPerKm: number; }

export interface EnergyHorizon {
  milestones: HorizonMilestone[];
  segments: HorizonSegment[];
  socAtArrivalPct: number;
  energyNeededKwh: number;
  avgWhPerKm: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function computeHorizon(
  plan: RoutePlan,
  socNowPct: number,
  observedWhPerKm: number,
  observedSpeedKmh: number,
  packKwh: number,
  fromKm = 0,               // progresso atual na rota (recalcula do ponto em diante)
  milestoneCount = 5,
): EnergyHorizon {
  const remainingKm = Math.max(0.01, plan.distanceKm - fromKm);

  // 1) Consumo previsto por trecho (usa a velocidade estimada de cada leg)
  const legs = plan.legSpeeds.filter((l) => l.toKm > fromKm);
  let energyKwh = 0;
  let weighted = 0;
  const legWh: { fromKm: number; toKm: number; whPerKm: number }[] = [];
  if (legs.length === 0) {
    const wh = Math.max(80, observedWhPerKm);
    energyKwh = (wh * remainingKm) / 1000;
    weighted = wh * remainingKm;
    legWh.push({ fromKm, toKm: plan.distanceKm, whPerKm: wh });
  } else {
    for (const leg of legs) {
      const a = Math.max(leg.fromKm, fromKm);
      const len = leg.toKm - a;
      if (len <= 0) continue;
      const wh = consumptionAtSpeed(observedWhPerKm, Math.max(20, observedSpeedKmh), leg.speedKmh);
      energyKwh += (wh * len) / 1000;
      weighted += wh * len;
      legWh.push({ fromKm: a, toKm: leg.toKm, whPerKm: wh });
    }
  }
  const avgWhPerKm = weighted / remainingKm;
  const socDrop = packKwh > 0 ? (energyKwh / packKwh) * 100 : 100;
  const socAtArrivalPct = clamp(socNowPct - socDrop, 0, 100);

  // 2) Marcos de SOC espacados pela rota restante
  const milestones: HorizonMilestone[] = [];
  for (let i = 1; i <= milestoneCount; i++) {
    const km = fromKm + (remainingKm * i) / milestoneCount;
    const spentKwh = energyUpTo(legWh, fromKm, km) / 1000;
    const socHere = clamp(socNowPct - (packKwh > 0 ? (spentKwh / packKwh) * 100 : 0), 0, 100);
    milestones.push({
      km,
      socPct: Math.round(socHere),
      coord: coordAtKm(plan, km),
      isArrival: i === milestoneCount,
    });
  }

  // 3) Segmentos coloridos (indices da geometria) por Wh/km relativo ao nominal da rota
  const segments: HorizonSegment[] = [];
  for (const leg of legWh) {
    const rel = leg.whPerKm / avgWhPerKm;
    const level: SegmentLevel = rel < 0.9 ? 'eco' : rel > 1.15 ? 'high' : 'normal';
    segments.push({
      fromIdx: indexAtKm(plan, leg.fromKm),
      toIdx: indexAtKm(plan, leg.toKm),
      level,
      whPerKm: Math.round(leg.whPerKm),
    });
  }

  return { milestones, segments, socAtArrivalPct: Math.round(socAtArrivalPct), energyNeededKwh: round1(energyKwh), avgWhPerKm: Math.round(avgWhPerKm) };
}

function energyUpTo(legWh: { fromKm: number; toKm: number; whPerKm: number }[], fromKm: number, km: number): number {
  let wh = 0;
  for (const leg of legWh) {
    const a = Math.max(leg.fromKm, fromKm);
    const b = Math.min(leg.toKm, km);
    if (b > a) wh += leg.whPerKm * (b - a);
  }
  return wh;
}

function coordAtKm(plan: RoutePlan, km: number) {
  return plan.geometry[indexAtKm(plan, km)];
}

function indexAtKm(plan: RoutePlan, km: number): number {
  const acc = plan.cumKm;
  let lo = 0, hi = acc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (acc[mid] < km) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function round1(v: number) { return Math.round(v * 10) / 10; }

/** Raio de autonomia atual (km) para o Range Map. */
export function rangeRadiusKm(socPct: number, packKwh: number, whPerKm: number, reservePct = 10): number {
  const usable = Math.max(0, (socPct - reservePct) / 100) * packKwh;
  return (usable * 1000) / Math.max(80, whPerKm);
}
