/**
 * Navigation Engine — rota real, instrucoes em portugues e progresso ao vivo.
 *
 * Roteamento: OSRM publico (router.project-osrm.org) — sem chave, CORS aberto.
 * Modulo desacoplado: TS puro; a UI so consome RoutePlan e NavProgress.
 */

import { decodePolyline, cumulativeKm, nearestVertex, haversineKm, formatDistance, type LatLng } from './geo';

export interface RouteStep {
  instruction: string;      // "Vire a esquerda"
  road: string;             // "Rodovia Castelo Branco"
  arrow: string;            // glifo da manobra: ← → ↑ ...
  startKm: number;          // km acumulado onde a manobra ACONTECE
  location: LatLng;
}

export interface RoutePlan {
  from: LatLng;
  to: LatLng;
  toName: string;
  geometry: LatLng[];
  cumKm: number[];          // km acumulado por vertice
  distanceKm: number;
  durationMin: number;
  steps: RouteStep[];
  /** velocidade media estimada por trecho entre steps (km/h) — alimenta o modelo de energia */
  legSpeeds: { fromKm: number; toKm: number; speedKmh: number }[];
  fetchedAt: number;
}

export interface NavProgress {
  routeIdx: number;
  traveledKm: number;
  remainingKm: number;
  remainingMin: number;
  nextStep: RouteStep | null;
  distToManeuverM: number;
  offRouteKm: number;       // distancia perpendicular aproximada a rota
  arrived: boolean;
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

const MANEUVER_PT: Record<string, string> = {
  'turn-left': 'Vire à esquerda',
  'turn-right': 'Vire à direita',
  'turn-slight left': 'Mantenha-se à esquerda',
  'turn-slight right': 'Mantenha-se à direita',
  'turn-sharp left': 'Curva fechada à esquerda',
  'turn-sharp right': 'Curva fechada à direita',
  'turn-straight': 'Siga em frente',
  'turn-uturn': 'Faça o retorno',
  'new name': 'Continue',
  'continue': 'Continue',
  'merge': 'Entre na via',
  'on ramp': 'Pegue o acesso',
  'off ramp': 'Pegue a saída',
  'fork-left': 'Na bifurcação, à esquerda',
  'fork-right': 'Na bifurcação, à direita',
  'fork': 'Siga pela bifurcação',
  'end of road-left': 'No fim da via, à esquerda',
  'end of road-right': 'No fim da via, à direita',
  'roundabout': 'Entre na rotatória',
  'rotary': 'Entre na rotatória',
  'exit roundabout': 'Saia da rotatória',
  'depart': 'Siga em frente',
  'arrive': 'Você chegou ao destino',
};

const ARROW: Record<string, string> = {
  'turn-left': '←', 'turn-right': '→',
  'turn-slight left': '↖', 'turn-slight right': '↗',
  'turn-sharp left': '↰', 'turn-sharp right': '↱',
  'fork-left': '↖', 'fork-right': '↗',
  'end of road-left': '←', 'end of road-right': '→',
  'roundabout': '↻', 'rotary': '↻', 'turn-uturn': '↩',
  'off ramp': '↗', 'on ramp': '↗', 'merge': '⇗',
  'arrive': '⚑',
};

function translate(type: string, modifier?: string): { instruction: string; arrow: string } {
  const key1 = type + (modifier ? '-' + modifier : '');
  const key2 = type === 'turn' && modifier ? 'turn-' + modifier : type;
  const instruction = MANEUVER_PT[key1] ?? MANEUVER_PT[key2] ?? MANEUVER_PT[type] ?? 'Continue';
  const arrow = ARROW[key1] ?? ARROW[key2] ?? ARROW[type] ?? '↑';
  return { instruction, arrow };
}

export async function fetchRoute(from: LatLng, to: LatLng, toName: string): Promise<RoutePlan> {
  const url = OSRM + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
    '?overview=full&geometries=polyline&steps=true&annotations=false';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Roteamento indisponível (' + r.status + ')');
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('Rota não encontrada');
  const route = j.routes[0];
  const geometry: LatLng[] = decodePolyline(route.geometry);
  const cumKm = cumulativeKm(geometry);
  const distanceKm = route.distance / 1000;
  const durationMin = route.duration / 60;

  const steps: RouteStep[] = [];
  const legSpeeds: RoutePlan['legSpeeds'] = [];
  let kmCursor = 0;
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      const loc: LatLng = { lat: s.maneuver.location[1], lng: s.maneuver.location[0] };
      const t = translate(s.maneuver.type, s.maneuver.modifier);
      steps.push({
        instruction: t.instruction,
        road: s.name || (s.ref ?? ''),
        arrow: t.arrow,
        startKm: kmCursor,
        location: loc,
      });
      const stepKm = (s.distance ?? 0) / 1000;
      const stepH = (s.duration ?? 0) / 3600;
      if (stepKm > 0.05 && stepH > 0) {
        legSpeeds.push({ fromKm: kmCursor, toKm: kmCursor + stepKm, speedKmh: stepKm / stepH });
      }
      kmCursor += stepKm;
    }
  }

  return { from, to, toName, geometry, cumKm, distanceKm, durationMin, steps, legSpeeds, fetchedAt: Date.now() };
}

/** Progresso do veiculo sobre a rota. hintIdx = ultimo indice conhecido (evita busca global). */
export function computeProgress(plan: RoutePlan, pos: LatLng, hintIdx = 0, speedKmh = 0): NavProgress {
  const near = nearestVertex(plan.geometry, pos, hintIdx);
  const traveledKm = plan.cumKm[near.idx];
  const remainingKm = Math.max(0, plan.distanceKm - traveledKm);
  // tempo restante: velocidade atual quando anda; media da rota quando parado
  const avgKmh = plan.distanceKm / (plan.durationMin / 60);
  const kmh = speedKmh > 15 ? speedKmh * 0.75 + avgKmh * 0.25 : avgKmh;
  const remainingMin = (remainingKm / Math.max(10, kmh)) * 60;

  // proxima manobra a frente (ignora 'depart')
  let nextStep: RouteStep | null = null;
  for (const s of plan.steps) {
    if (s.startKm > traveledKm + 0.01) { nextStep = s; break; }
  }
  const distToManeuverM = nextStep ? Math.max(0, (nextStep.startKm - traveledKm) * 1000) : Math.max(0, remainingKm * 1000);
  const arrived = remainingKm < 0.08 || haversineKm(pos, plan.to) < 0.06;

  return {
    routeIdx: near.idx,
    traveledKm,
    remainingKm,
    remainingMin,
    nextStep,
    distToManeuverM,
    offRouteKm: near.distKm,
    arrived,
  };
}

export function maneuverText(p: NavProgress): { line1: string; line2: string; arrow: string } {
  if (!p.nextStep) return { line1: 'Siga em frente', line2: '', arrow: '↑' };
  return {
    line1: 'Em ' + formatDistance(p.distToManeuverM),
    line2: p.nextStep.instruction + (p.nextStep.road ? ' · ' + p.nextStep.road : ''),
    arrow: p.nextStep.arrow,
  };
}
