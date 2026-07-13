/**
 * Confidence Engine — quanto o motorista pode CONFIAR na previsão.
 *
 * Poucos apps deixam isso claro; o Encorpei mostra na cara: um número
 * honesto + o checklist do que está (e do que ainda não está) no modelo.
 * TS puro, sem React: mesmo padrão dos demais engines.
 */

export type FactorState = 'ok' | 'warn';

export interface ConfidenceFactor {
  label: string;
  state: FactorState;
  detail?: string;
}

export interface ConfidenceReport {
  pct: number; // 0..100 — honesto: máx. 96 (98 com clima informado) enquanto trânsito não entra
  level: 'high' | 'medium' | 'low';
  factors: ConfidenceFactor[];
  marginPct: number | null; // margem sobre a reserva (do PredictionEngine)
}

export interface ConfidenceInput {
  telemetryLive: boolean; // SOC lido do carro (Vgate) em tempo real
  socManual: boolean; // SOC informado manualmente pelo motorista
  socKnown: boolean;
  gpsFresh: boolean; // posição recente e precisa
  routeFresh: boolean; // rota calculada/recalculada há pouco
  consumptionObserved: boolean; // consumo REAL medido nesta viagem
  marginPct: number | null;
  /** true quando o motorista informou clima/carga/vento manualmente (EnvironmentFactors ativo). */
  climateConsidered?: boolean;
}

export function assessConfidence(i: ConfidenceInput): ConfidenceReport {
  let pct = 8; // base do modelo físico (rolamento + aero) — nunca zero, nunca fé cega
  const factors: ConfidenceFactor[] = [];

  // Fonte do SOC — o dado que mais pesa na previsão
  if (i.telemetryLive) {
    pct += 34;
    factors.push({ label: 'Dados do veículo em tempo real', state: 'ok' });
  } else if (i.socManual && i.socKnown) {
    pct += 22;
    factors.push({ label: 'Bateria informada manualmente', state: 'warn', detail: 'conecte o Vgate para leitura automática' });
  } else {
    factors.push({ label: 'Bateria desconhecida', state: 'warn', detail: 'informe o % atual para ativar as previsões' });
  }

  if (i.gpsFresh) { pct += 18; factors.push({ label: 'GPS com bom sinal', state: 'ok' }); }
  else factors.push({ label: 'GPS instável ou sem sinal', state: 'warn' });

  if (i.routeFresh) { pct += 16; factors.push({ label: 'Rota recalculada', state: 'ok' }); }
  else factors.push({ label: 'Rota pode estar desatualizada', state: 'warn' });

  if (i.consumptionObserved) { pct += 20; factors.push({ label: 'Consumo real desta viagem aplicado', state: 'ok' }); }
  else { pct += 10; factors.push({ label: 'Consumo estimado pelo perfil do veículo', state: 'warn', detail: 'melhora após ~1 km rodado' }); }

  // Honestidade radical: o que o modelo AINDA não considera
  if (i.climateConsidered) {
    pct += 4;
    factors.push({ label: 'Clima e carga considerados', state: 'ok' });
  } else {
    factors.push({ label: 'Clima considerado', state: 'warn', detail: 'informe manualmente para ativar' });
  }
  factors.push({ label: 'Trânsito considerado', state: 'warn', detail: 'em breve' });

  const cap = i.climateConsidered ? 98 : 96;
  pct = Math.max(0, Math.min(cap, Math.round(pct)));
  const level: ConfidenceReport['level'] = pct >= 80 ? 'high' : pct >= 55 ? 'medium' : 'low';

  return { pct, level, factors, marginPct: i.marginPct };
}
