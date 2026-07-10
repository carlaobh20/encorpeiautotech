/**
 * Configuração do Vehicle Gateway.
 * Mesma chave publicável usada pelo PWA (segura para distribuir).
 * Projeto Supabase dedicado: encorpriautotech (org ENCORPEITECH).
 * Para trocar de projeto: alterar apenas URL e KEY aqui e no PWA.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://awdxkyymnltiwhxzcsfa.supabase.co';
export const SUPABASE_KEY = process.env.SUPABASE_KEY ?? 'sb_publishable_cIsDs9WCjbD0Opm511kDqw_XKSX7CJw';
export const VEHICLE_CHANNEL = 'vehicle:aion-ut';
export const TELEMETRY_EVENT = 'telemetry';
export const PUBLISH_INTERVAL_MS = 500;
