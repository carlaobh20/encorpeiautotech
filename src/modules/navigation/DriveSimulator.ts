/**
 * DriveSimulator — dirige a rota de verdade, da mesa.
 *
 * Quando o app roda com ?source=mock, quem "anda" e este modulo:
 * ele percorre a geometria real da rota com perfil de velocidade plausivel
 * (acelera em reta, reduz antes de manobra) e publica posicao/rumo/velocidade.
 * Todo o produto — camera, instrucoes, horizon, IA — fica testavel sem carro.
 */

import { bearingDeg, pointAhead, type LatLng } from './geo';
import type { RoutePlan } from './NavigationEngine';

export interface SimPose { lat: number; lng: number; headingDeg: number; speedKmh: number; }

const TICK_MS = 500;

export class DriveSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private plan: RoutePlan | null = null;
  private km = 0;
  private speed = 0; // km/h

  start(plan: RoutePlan, onPose: (p: SimPose) => void, speedFactor = 1) {
    this.stop();
    this.plan = plan;
    this.km = 0;
    this.speed = 0;

    this.timer = setInterval(() => {
      const pl = this.plan!;
      // velocidade alvo: a do trecho atual, reduzida perto de manobras
      let target = 60;
      for (const leg of pl.legSpeeds) {
        if (this.km >= leg.fromKm && this.km <= leg.toKm) { target = Math.min(110, leg.speedKmh); break; }
      }
      let distToManeuver = Infinity;
      for (const s of pl.steps) {
        if (s.startKm > this.km + 0.005) { distToManeuver = (s.startKm - this.km) * 1000; break; }
      }
      if (distToManeuver < 120) target = Math.min(target, 24);
      else if (distToManeuver < 350) target = Math.min(target, 45);

      // suaviza aceleracao/frenagem
      const accel = this.speed < target ? 5.5 : -8.5; // km/h por tick
      this.speed = Math.max(0, Math.min(target, this.speed + accel));
      if (this.speed < 12 && target > 12) this.speed = 12; // arranca

      this.km += (this.speed * speedFactor) * (TICK_MS / 3_600_000);
      if (this.km >= pl.distanceKm) { this.km = pl.distanceKm; this.speed = 0; }

      // posicao e rumo
      const idx = indexAtKm(pl, this.km);
      const pos = pl.geometry[idx];
      const ahead = pointAhead(pl.geometry, pl.cumKm, idx, 0.06);
      const heading = bearingDeg(pos, ahead);
      onPose({ lat: pos.lat, lng: pos.lng, headingDeg: heading, speedKmh: Math.round(this.speed) });

      if (this.km >= pl.distanceKm) this.stop();
    }, TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get running() { return this.timer !== null; }
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
