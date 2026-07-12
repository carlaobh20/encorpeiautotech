/**
 * Copilot AI — a voz que acompanha a viagem. Nunca um chat.
 *
 * Observa o estado continuamente e fala APENAS quando ha algo util:
 * cartoes curtos, pessoais, que aparecem e desaparecem sozinhos.
 * Cada gatilho tem cooldown proprio — a IA nunca vira spam.
 */

import { USER_NAME } from '../../config/assumptions';

export type CardTone = 'info' | 'good' | 'warn' | 'critical';

export interface CopilotCard {
  id: string;
  text: string;
  tone: CardTone;
  ttlMs: number;       // quanto tempo fica na tela
  createdAt: number;
}

export interface CopilotContext {
  navigating: boolean;
  socPct: number | null;
  socAtArrivalPct: number | null;
  speedKmh: number | null;
  powerKw: number | null;
  batteryTempC: number | null;
  regenKwhTrip: number;            // acumulado da viagem
  consumptionWhPerKm: number | null;
  nominalWhPerKm: number;
  remainingKm: number | null;
  cheaperChargerAheadKm: number | null; // preparado p/ quando houver dado de preco
}

interface Rule {
  id: string;
  cooldownMs: number;
  evaluate: (c: CopilotContext, mem: Memory) => { text: string; tone: CardTone } | null;
}

interface Memory {
  lastArrivalSoc: number | null;
  lastRegenKm: number;
  saidTempIdeal: boolean;
  saidEfficient: boolean;
}

const KM_PER_KWH_REGEN = 6; // km recuperados por kWh regenerado (nominal)

const RULES: Rule[] = [
  {
    id: 'arrival-critical',
    cooldownMs: 90_000,
    evaluate: (c) => {
      if (!c.navigating || c.socAtArrivalPct === null) return null;
      if (c.socAtArrivalPct < 5)
        return { text: USER_NAME + ', você não chega com essa carga. Vou procurar um carregador na rota.', tone: 'critical' };
      return null;
    },
  },
  {
    id: 'arrival-update',
    cooldownMs: 120_000,
    evaluate: (c, mem) => {
      if (!c.navigating || c.socAtArrivalPct === null) return null;
      const last = mem.lastArrivalSoc;
      if (last === null || Math.abs(c.socAtArrivalPct - last) >= 5) {
        mem.lastArrivalSoc = c.socAtArrivalPct;
        if (last === null) return null; // primeira leitura: o sheet ja mostra
        const dir = c.socAtArrivalPct > last ? 'melhorou' : 'caiu';
        return {
          text: USER_NAME + ', a previsão ' + dir + ': mantendo esse ritmo você chega com ' + c.socAtArrivalPct + '%.',
          tone: c.socAtArrivalPct > last ? 'good' : 'warn',
        };
      }
      return null;
    },
  },
  {
    id: 'regen-milestone',
    cooldownMs: 180_000,
    evaluate: (c, mem) => {
      const km = c.regenKwhTrip * KM_PER_KWH_REGEN;
      if (km - mem.lastRegenKm >= 3) {
        mem.lastRegenKm = km;
        return { text: USER_NAME + ', você já recuperou ' + km.toFixed(0) + ' km com a regeneração.', tone: 'good' };
      }
      return null;
    },
  },
  {
    id: 'temp-ideal',
    cooldownMs: Infinity,
    evaluate: (c, mem) => {
      if (mem.saidTempIdeal || c.batteryTempC === null) return null;
      if (c.batteryTempC >= 20 && c.batteryTempC <= 35) {
        mem.saidTempIdeal = true;
        return { text: USER_NAME + ', a bateria atingiu a temperatura ideal. Carregamento rápido liberado.', tone: 'good' };
      }
      return null;
    },
  },
  {
    id: 'driving-efficient',
    cooldownMs: Infinity,
    evaluate: (c, mem) => {
      if (mem.saidEfficient || !c.navigating || c.consumptionWhPerKm === null) return null;
      if (c.consumptionWhPerKm < c.nominalWhPerKm * 0.88 && (c.speedKmh ?? 0) > 40) {
        mem.saidEfficient = true;
        return { text: USER_NAME + ', você está dirigindo de forma extremamente eficiente. Consumo 12% abaixo do normal.', tone: 'good' };
      }
      return null;
    },
  },
  {
    id: 'consumption-up',
    cooldownMs: 240_000,
    evaluate: (c) => {
      if (!c.navigating || c.consumptionWhPerKm === null) return null;
      if (c.consumptionWhPerKm > c.nominalWhPerKm * 1.3 && (c.speedKmh ?? 0) > 60) {
        return { text: USER_NAME + ', o consumo subiu ' + Math.round((c.consumptionWhPerKm / c.nominalWhPerKm - 1) * 100) + '% — vento contrário ou subida. Reduzir 10 km/h ajuda.', tone: 'warn' };
      }
      return null;
    },
  },
  {
    id: 'cheaper-charger',
    cooldownMs: Infinity,
    evaluate: (c) => {
      if (c.cheaperChargerAheadKm === null) return null;
      return { text: USER_NAME + ', há um carregador melhor ' + c.cheaperChargerAheadKm.toFixed(0) + ' km à frente.', tone: 'info' };
    },
  },
];

export class CopilotFeed {
  private lastFired = new Map<string, number>();
  private mem: Memory = { lastArrivalSoc: null, lastRegenKm: 0, saidTempIdeal: false, saidEfficient: false };
  private seq = 0;

  reset() {
    this.lastFired.clear();
    this.mem = { lastArrivalSoc: null, lastRegenKm: 0, saidTempIdeal: false, saidEfficient: false };
  }

  /** Avalia as regras; retorna no maximo UM cartao novo por tick. */
  evaluate(ctx: CopilotContext): CopilotCard | null {
    const now = Date.now();
    for (const rule of RULES) {
      const last = this.lastFired.get(rule.id) ?? 0;
      if (now - last < rule.cooldownMs) continue;
      const hit = rule.evaluate(ctx, this.mem);
      if (hit) {
        this.lastFired.set(rule.id, now);
        return {
          id: rule.id + '-' + this.seq++,
          text: hit.text,
          tone: hit.tone,
          ttlMs: hit.tone === 'critical' ? 15000 : 9000,
          createdAt: now,
        };
      }
    }
    return null;
  }
}

/** Tres recomendacoes pos-viagem, geradas das estatisticas reais. */
export function tripRecommendations(stats: {
  distanceKm: number; energyUsedKwh: number; energyRegenKwh: number;
  avgSpeedKmh: number; maxSpeedKmh: number; nominalWhPerKm: number;
}): string[] {
  const recs: string[] = [];
  const net = Math.max(0.01, stats.energyUsedKwh - stats.energyRegenKwh);
  const whKm = stats.distanceKm > 0.5 ? (net / stats.distanceKm) * 1000 : stats.nominalWhPerKm;
  const regenPct = stats.energyUsedKwh > 0.05 ? (stats.energyRegenKwh / stats.energyUsedKwh) * 100 : 0;

  if (whKm > stats.nominalWhPerKm * 1.15) {
    recs.push('Seu consumo ficou ' + Math.round((whKm / stats.nominalWhPerKm - 1) * 100) + '% acima do nominal. Antecipar as frenagens e manter velocidade constante derruba esse número.');
  } else {
    recs.push('Consumo dentro do esperado para o trajeto. Manter velocidade de cruzeiro estável é o que mais preserva a previsão de chegada.');
  }

  if (regenPct < 12) {
    recs.push('Você recuperou só ' + regenPct.toFixed(0) + '% da energia em regeneração. Tirar o pé mais cedo antes de parar aumenta esse ganho sem custo.');
  } else {
    recs.push('Ótima regeneração: ' + regenPct.toFixed(0) + '% da energia voltou para a bateria. Continue freando com antecedência.');
  }

  if (stats.maxSpeedKmh > stats.avgSpeedKmh * 1.9 && stats.maxSpeedKmh > 90) {
    recs.push('Picos de ' + stats.maxSpeedKmh.toFixed(0) + ' km/h custam caro em aerodinâmica. Acima de 100 km/h, cada +10 km/h consome ~10% a mais.');
  } else {
    recs.push('Carregar até 80% no dia a dia (em vez de 100%) preserva a saúde das células no longo prazo.');
  }

  return recs.slice(0, 3);
}
