/**
 * AIAdvisor — ponte com /api/ai-advice (Vercel Edge Function), que chama
 * a Gemini API do lado do servidor (a chave nunca roda no navegador).
 * O client fica burro: manda o contexto da viagem ja calculado pelos
 * engines existentes, recebe um paragrafo pronto ou um erro — e quem
 * chama decide o que fazer com o erro (aqui: cair pro veredito baseado
 * em regras, que ja existia e continua funcionando sem a IA).
 */

export interface AIAdviceContext {
  vehicleName: string;
  destinationName: string;
  distanceKm: number;
  durationMin: number;
  socNowPct: number | null;
  socAtArrivalPct: number | null;
  needsCharge: boolean;
  chargeMin: number | null;
  chargerName: string | null;
  consumptionWhPerKm: number;
  nominalWhPerKm: number;
  drivingProfile: 'eco' | 'normal' | 'esportivo';
  environmentFactors: { label: string; effectPct: number }[];
}

export type AIAdviceResult = { ok: true; advice: string } | { ok: false; reason: string };

export async function fetchAIAdvice(ctx: AIAdviceContext, signal?: AbortSignal): Promise<AIAdviceResult> {
  try {
    const res = await fetch('/api/ai-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
      signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || typeof json.advice !== 'string') {
      return { ok: false, reason: (json && json.error) || 'http_' + res.status };
    }
    return { ok: true, advice: json.advice };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, reason: 'aborted' };
    return { ok: false, reason: 'network_error' };
  }
}
