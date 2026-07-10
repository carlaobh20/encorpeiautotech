/**
 * Configuração do PWA.
 * A chave abaixo é a chave PUBLICÁVEL do Supabase — feita para viver
 * no front-end (o que protege os dados são as políticas RLS, não ela).
 *
 * Projeto Supabase dedicado: encorpriautotech (org ENCORPEITECH).
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://awdxkyymnltiwhxzcsfa.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_cIsDs9WCjbD0Opm511kDqw_XKSX7CJw';

/** Canal Realtime onde o Vehicle Gateway publica a telemetria. */
export const VEHICLE_CHANNEL = 'vehicle:aion-ut';

/** Evento de broadcast com o payload VehicleData. */
export const TELEMETRY_EVENT = 'telemetry';
