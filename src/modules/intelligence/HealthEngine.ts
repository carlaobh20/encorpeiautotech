/**
 * HealthEngine — centenas de sensores viram UMA nota.
 *
 * Recebe o VehicleData e devolve "Saude 98/100" + o detalhe por subsistema
 * (bateria, celulas, motor, sistema eletrico, 12V) em linguagem simples.
 * Subsistema sem dado ainda (PIDs nao validados) entra como 'unknown' e
 * NAO derruba a nota — a nota reflete apenas o que foi medido.
 *
 * TS puro, deterministico, zero React/DOM: roda no PWA e no nativo.
 */

import type { VehicleData } from '../vehicle/types';

export type HealthLevel = 'excellent' | 'good' | 'attention' | 'critical' | 'unknown';

export type SubsystemId = 'battery' | 'cells' | 'motor' | 'electrical' | 'aux12v';

export interface SubsystemHealth {
  id: SubsystemId;
  label: string;          // "Bateria", "Celulas"...
  score: number | null;   // 0..100 (null = sem dados)
  level: HealthLevel;
  summary: string;        // frase curta em linguagem simples
}

export interface HealthReport {
  score: number | null;   // nota geral 0..100 (null = nada medido ainda)
  level: HealthLevel;
  headline: string;       // "Saude 98/100 — tudo em ordem"
  subsystems: SubsystemHealth[];
  generatedAt: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function levelOf(score: number | null): HealthLevel {
  if (score === null) return 'unknown';
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'attention';
  return 'critical';
}

/** Peso de cada subsistema na nota geral (renormalizado sobre os medidos). */
const WEIGHT: Record<SubsystemId, number> = {
  battery: 0.40,
  cells: 0.25,
  motor: 0.15,
  electrical: 0.12,
  aux12v: 0.08,
};

// ---------- Avaliadores por subsistema ----------

function assessBattery(d: VehicleData): SubsystemHealth {
  if (d.soh === null && d.batteryTempC === null) {
    return { id: 'battery', label: 'Bateria', score: null, level: 'unknown', summary: 'Aguardando dados do BMS.' };
  }
  let score = 100;
  let notes: string[] = [];

  if (d.soh !== null) {
    // SOH 100..70% mapeia para 100..40 pontos (abaixo de 70% e critico).
    score = clamp(40 + ((d.soh - 70) / 30) * 60, 5, 100);
    if (d.soh >= 95) notes.push('Capacidade como nova (' + d.soh.toFixed(0) + '%).');
    else if (d.soh >= 88) notes.push('Desgaste normal para o uso (' + d.soh.toFixed(0) + '%).');
    else notes.push('Capacidade em ' + d.soh.toFixed(0) + '% — acompanhar de perto.');
  }

  const t = d.batteryTempC;
  if (t !== null) {
    if (t > 55) { score -= 40; notes.push('Pack muito quente (' + t.toFixed(0) + ' °C).'); }
    else if (t > 45) { score -= 15; notes.push('Pack aquecido (' + t.toFixed(0) + ' °C).'); }
    else if (t < -5) { score -= 15; notes.push('Pack muito frio (' + t.toFixed(0) + ' °C).'); }
  }
  if (d.battTempMin !== null && d.battTempMax !== null) {
    const spread = d.battTempMax - d.battTempMin;
    if (spread > 8) { score -= 10; notes.push('Diferenca de ' + spread.toFixed(0) + ' °C entre modulos.'); }
  }

  score = clamp(score, 0, 100);
  return {
    id: 'battery', label: 'Bateria', score, level: levelOf(score),
    summary: notes[0] ?? 'Operando dentro do esperado.',
  };
}

function assessCells(d: VehicleData): SubsystemHealth {
  const min = d.cellVoltageMin, max = d.cellVoltageMax;
  if (min === null || max === null) {
    return { id: 'cells', label: 'Celulas', score: null, level: 'unknown', summary: 'Aguardando leitura celula a celula.' };
  }
  const deltaMv = Math.round((max - min) * 1000);
  let score: number;
  let summary: string;
  if (deltaMv <= 30) { score = 100; summary = 'Celulas perfeitamente balanceadas (' + deltaMv + ' mV).'; }
  else if (deltaMv <= 50) { score = 85; summary = 'Balanceamento bom (' + deltaMv + ' mV).'; }
  else if (deltaMv <= 80) { score = 65; summary = 'Leve desbalanceamento (' + deltaMv + ' mV).'; }
  else if (deltaMv <= 120) { score = 45; summary = 'Desbalanceamento relevante (' + deltaMv + ' mV).'; }
  else { score = 25; summary = 'Celulas muito desbalanceadas (' + deltaMv + ' mV).'; }

  if (min < 3.0) { score = Math.min(score, 20); summary = 'Celula em tensao critica (' + min.toFixed(2) + ' V).'; }

  return { id: 'cells', label: 'Celulas', score, level: levelOf(score), summary };
}

function assessMotor(d: VehicleData): SubsystemHealth {
  const t = d.motorTempC;
  if (t === null) {
    return { id: 'motor', label: 'Motor', score: null, level: 'unknown', summary: 'Aguardando sensor de temperatura.' };
  }
  let score: number;
  let summary: string;
  if (t < 70) { score = 100; summary = 'Temperatura normal (' + t.toFixed(0) + ' °C).'; }
  else if (t < 90) { score = 85; summary = 'Trabalhando quente (' + t.toFixed(0) + ' °C) — normal em uso intenso.'; }
  else if (t < 110) { score = 60; summary = 'Motor quente (' + t.toFixed(0) + ' °C) — alivie o pe.'; }
  else { score = 25; summary = 'Motor muito quente (' + t.toFixed(0) + ' °C).'; }
  return { id: 'motor', label: 'Motor', score, level: levelOf(score), summary };
}

function assessElectrical(d: VehicleData): SubsystemHealth {
  if (d.voltage === null) {
    return { id: 'electrical', label: 'Sistema eletrico', score: null, level: 'unknown', summary: 'Aguardando leitura do pack.' };
  }
  // Faixa plausivel de um pack ~60 kWh (Aion UT): fora dela = sensor ou problema real.
  const v = d.voltage;
  let score: number;
  let summary: string;
  if (v >= 300 && v <= 470) { score = 100; summary = 'Tensao do pack estavel (' + v.toFixed(0) + ' V).'; }
  else if (v >= 260 && v < 300) { score = 60; summary = 'Tensao baixa (' + v.toFixed(0) + ' V) — bateria muito descarregada.'; }
  else { score = 35; summary = 'Tensao fora da faixa esperada (' + v.toFixed(0) + ' V).'; }
  return { id: 'electrical', label: 'Sistema eletrico', score, level: levelOf(score), summary };
}

function assessAux12v(_d: VehicleData): SubsystemHealth {
  // O VehicleData ainda nao expoe a bateria 12V (PID a validar no carro).
  // O subsistema ja existe no contrato para o dado encaixar sem refactor.
  return { id: 'aux12v', label: 'Bateria 12V', score: null, level: 'unknown', summary: 'Sensor ainda nao mapeado.' };
}

// ---------- Nota geral ----------

export function assessHealth(d: VehicleData): HealthReport {
  const subsystems: SubsystemHealth[] = [
    assessBattery(d),
    assessCells(d),
    assessMotor(d),
    assessElectrical(d),
    assessAux12v(d),
  ];

  const measured = subsystems.filter((s) => s.score !== null);
  let score: number | null = null;
  if (measured.length > 0) {
    let sum = 0, wsum = 0;
    for (const s of measured) { sum += (s.score as number) * WEIGHT[s.id]; wsum += WEIGHT[s.id]; }
    score = Math.round(sum / wsum);
  }

  const level = levelOf(score);
  let headline: string;
  if (score === null) headline = 'Aguardando dados do veiculo';
  else if (level === 'excellent') headline = 'Saude ' + score + '/100 — tudo em ordem';
  else if (level === 'good') headline = 'Saude ' + score + '/100 — desgaste normal';
  else if (level === 'attention') headline = 'Saude ' + score + '/100 — merece atencao';
  else headline = 'Saude ' + score + '/100 — procure assistencia';

  return { score, level, headline, subsystems, generatedAt: Date.now() };
}
