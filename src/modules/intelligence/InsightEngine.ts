/**
 * InsightEngine — a voz do copiloto.
 *
 * Recebe estado + previsao e devolve APENAS frases uteis, priorizadas.
 * A IA nunca interrompe: retorna no maximo os N insights que importam agora.
 * "O usuario nao quer sensores. Quer respostas."
 *
 * TS puro e portavel (PWA e nativo).
 */

import type { Prediction } from './PredictionEngine';

export type InsightTone = 'info' | 'good' | 'warn' | 'critical';

export interface Insight {
  id: string;
  text: string;
  tone: InsightTone;
  priority: number; // maior = mais importante
}

export interface InsightContext {
  prediction: Prediction | null;
  powerKw: number | null;          // < 0 = regenerando
  batteryTempC: number | null;
  speedKmh: number | null;
  /** Resultado do "e se eu reduzir a velocidade" (do PredictionEngine). */
  slowerHint?: { deltaSpeedKmh: number; socPct: number } | null;
  /** Consumo recente vs media historica, em % (>0 = pior que a media). */
  efficiencyDeltaPct?: number | null;
}

const FAST_CHARGE_IDEAL: [number, number] = [15, 35]; // faixa ideal de temp p/ carga rapida (C)

export function deriveInsights(ctx: InsightContext, max = 2): Insight[] {
  const out: Insight[] = [];
  const p = ctx.prediction;

  if (p) {
    if (p.status === 'insufficient') {
      out.push({ id: 'arrival-insufficient', tone: 'critical', priority: 100,
        text: 'Voce nao chega ao destino. Pare para carregar.' });
    } else if (p.status === 'tight') {
      out.push({ id: 'arrival-tight', tone: 'warn', priority: 90,
        text: 'Chegada apertada: ' + p.socAtArrivalPct + '%. Margem baixa.' });
    } else {
      out.push({ id: 'arrival-ok', tone: 'good', priority: 40,
        text: 'Voce chegara com ' + p.socAtArrivalPct + '%.' });
    }

    // Coaching: reduzir velocidade ajuda de forma relevante?
    if (ctx.slowerHint && p.socAtArrivalPct >= 0) {
      const gain = ctx.slowerHint.socPct - p.socAtArrivalPct;
      if (gain >= 3) {
        out.push({ id: 'coach-slower', tone: 'info', priority: p.status === 'ok' ? 55 : 85,
          text: 'Reduzindo ' + ctx.slowerHint.deltaSpeedKmh + ' km/h voce chega com ' + ctx.slowerHint.socPct + '%.' });
      }
    }
  }

  if (ctx.powerKw !== null && ctx.powerKw < -3) {
    out.push({ id: 'regen', tone: 'good', priority: 20, text: 'A bateria esta regenerando.' });
  }

  if (ctx.batteryTempC !== null &&
      ctx.batteryTempC >= FAST_CHARGE_IDEAL[0] && ctx.batteryTempC <= FAST_CHARGE_IDEAL[1]) {
    out.push({ id: 'temp-ideal', tone: 'good', priority: 15,
      text: 'Temperatura ideal para carga rapida.' });
  }

  if (ctx.efficiencyDeltaPct !== null && ctx.efficiencyDeltaPct !== undefined && ctx.efficiencyDeltaPct > 12) {
    out.push({ id: 'eff-drop', tone: 'warn', priority: 30,
      text: 'A eficiencia caiu ' + Math.round(ctx.efficiencyDeltaPct) + '% em relacao a sua media.' });
  }

  return out.sort((a, b) => b.priority - a.priority).slice(0, max);
}
