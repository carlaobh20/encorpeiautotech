import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, VEHICLE_CHANNEL, TELEMETRY_EVENT } from './config.js';

/** Abre o canal Realtime e devolve uma função publish(data). */
export async function createPublisher() {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);
  const channel = client.channel(VEHICLE_CHANNEL);

  await new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Falha ao abrir canal Realtime: ${status}`));
      }
    });
  });

  console.log(`[gateway] Canal ${VEHICLE_CHANNEL} aberto. Publicando...`);

  return async function publish(data) {
    await channel.send({ type: 'broadcast', event: TELEMETRY_EVENT, payload: data });
  };
}
