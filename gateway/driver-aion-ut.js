/**
 * ⚠️ DRIVER NÃO VALIDADO — espelho do driver do PWA.
 * Preencher os campos null após rodar `node index.js --discover`
 * no carro e analisar o arquivo discovery-*.log.
 */
export const AION_UT_PIDS = {
  speedKmh: { mode: '01', pid: '0D', parse: 'A' },
  soc: { mode: '01', pid: '5B', parse: 'A*100/255' },
  voltage: null,      // TODO pós-descoberta
  current: null,      // TODO pós-descoberta
  batteryTempC: null, // TODO pós-descoberta
  soh: null,          // TODO pós-descoberta
  odometerKm: null,   // TODO pós-descoberta
};
