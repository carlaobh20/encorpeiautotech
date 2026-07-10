/**
 * ENCORPEI VEHICLE GATEWAY
 *
 * Processo independente do PWA. Lê dados do veículo e publica no
 * Supabase Realtime. Hoje roda em desktop (Node.js); amanhã o mesmo
 * conceito roda em Android, Raspberry Pi ou hardware próprio — o PWA
 * não muda uma linha.
 *
 * Modos:
 *   node index.js --simulate   → publica dados simulados (valida o pipeline)
 *   node index.js --discover   → conecta no Vgate e varre PIDs (validação do Aion UT)
 *   node index.js --ble        → conecta no Vgate e publica dados reais
 */

import { createPublisher } from './publisher.js';
import { createSimulator } from './simulator.js';
import { PUBLISH_INTERVAL_MS } from './config.js';

const mode = process.argv.find((a) => a.startsWith('--'))?.slice(2) ?? 'simulate';

async function main() {
  console.log(`[gateway] Modo: ${mode}`);

  if (mode === 'simulate') {
    const publish = await createPublisher();
    const tick = createSimulator();
    setInterval(async () => {
      const data = tick(PUBLISH_INTERVAL_MS);
      await publish(data);
      process.stdout.write(
        `\r[sim] ${String(data.speedKmh).padStart(3)} km/h | ${data.powerKw} kW | SOC ${data.soc}%   `
      );
    }, PUBLISH_INTERVAL_MS);
    return;
  }

  if (mode === 'discover') {
    const { createElmSession } = await import('./elm-ble.js');
    const session = await createElmSession();
    await session.discover();
    await session.close();
    process.exit(0);
  }

  if (mode === 'ble') {
    const { createElmSession } = await import('./elm-ble.js');
    const { parseElmResponse } = await import('./elm-parse.js');
    const { AION_UT_PIDS } = await import('./driver-aion-ut.js');

    const publish = await createPublisher();
    const session = await createElmSession();

    console.log('[gateway] Lendo PIDs do driver Aion UT...');
    setInterval(async () => {
      const data = { timestamp: Date.now() };
      for (const [field, def] of Object.entries(AION_UT_PIDS)) {
        if (!def) continue; // PID ainda não validado
        const raw = await session.query(def.mode, def.pid);
        data[field] = parseElmResponse(raw, def);
      }
      await publish(data);
      process.stdout.write(`\r[ble] ${JSON.stringify(data).slice(0, 90)}...  `);
    }, PUBLISH_INTERVAL_MS);
    return;
  }

  console.error(`Modo desconhecido: ${mode}. Use --simulate, --discover ou --ble.`);
  process.exit(1);
}

main().catch((err) => {
  console.error('\n[gateway] Erro fatal:', err.message);
  process.exit(1);
});
