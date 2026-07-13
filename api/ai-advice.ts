/**
 * /api/ai-advice — Vercel Edge Function.
 *
 * Unico lugar do sistema que sabe da GEMINI_API_KEY. Roda no servidor da
 * Vercel, nunca no navegador: o bundle do Vite (client) so conhece essa
 * URL relativa e nunca ve a chave. Recebe o contexto da viagem ja
 * calculado pelos engines existentes (PredictionEngine/EnergyHorizon/
 * EnvironmentFactors) e pede pra Gemini transformar isso num paragrafo
 * curto em portugues — a IA explica, nao recalcula nada sozinha.
 */

export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

interface AIAdviceContext {
  vehicleName?: string;
  destinationName?: string;
  distanceKm?: number;
  durationMin?: number;
  socNowPct?: number | null;
  socAtArrivalPct?: number | null;
  needsCharge?: boolean;
  chargeMin?: number | null;
  chargerName?: string | null;
  consumptionWhPerKm?: number;
  nominalWhPerKm?: number;
  drivingProfile?: 'eco' | 'normal' | 'esportivo';
  environmentFactors?: { label: string; effectPct: number }[];
}

function buildPrompt(ctx: AIAdviceContext): string {
  const factors = (ctx.environmentFactors ?? [])
    .map((f) => `${f.label} (${f.effectPct > 0 ? '+' : ''}${f.effectPct}%)`)
    .join(', ') || 'nenhum fator extra informado';

  return `Você é o copiloto de energia de um app para donos de carro elétrico no Brasil. Escreva UM parágrafo curto (no máximo 3 frases), direto, em português brasileiro, explicando a viagem abaixo e se há algo com que se preocupar. Nunca invente números — use só os dados fornecidos. Se a bateria for suficiente com margem confortável, tranquilize em vez de alarmar. Se for apertado ou precisar recarregar, explique o porquê em termos simples e o que fazer. Escolha só os 2-3 dados mais relevantes, não repita todos. Tom confiante, sem jargão técnico, como alguém que entende de carro elétrico e fala reto. Responda só com o parágrafo, sem saudação, sem título, sem markdown.

Dados da viagem:
- Veículo: ${ctx.vehicleName ?? 'carro elétrico'}
- Destino: ${ctx.destinationName ?? '—'}
- Distância: ${ctx.distanceKm ?? '—'} km, tempo estimado ${ctx.durationMin ?? '—'} min
- Bateria agora: ${ctx.socNowPct ?? '—'}%
- Bateria prevista na chegada: ${ctx.socAtArrivalPct ?? '—'}%
- Precisa recarregar no caminho: ${ctx.needsCharge ? `sim, em ${ctx.chargerName ?? 'um carregador na rota'}, por ~${ctx.chargeMin ?? '—'} min` : 'não'}
- Consumo previsto: ${ctx.consumptionWhPerKm ?? '—'} Wh/km (nominal do carro: ${ctx.nominalWhPerKm ?? '—'} Wh/km)
- Perfil de condução selecionado: ${ctx.drivingProfile ?? 'normal'}
- Fatores de ambiente considerados: ${factors}`;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'ai_not_configured' }, 503);
  }

  let ctx: AIAdviceContext;
  try {
    ctx = await request.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const prompt = buildPrompt(ctx);

  let upstream: Response;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
      }),
    });
  } catch (e) {
    return json({ error: 'fetch_failed', detail: String((e as Error)?.message ?? e) }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: 'gemini_error', status: upstream.status, detail: detail.slice(0, 300) }, 502);
  }

  const data = await upstream.json().catch(() => null);
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return json({ error: 'empty_response' }, 502);
  }

  return json({ advice: text.trim() }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
