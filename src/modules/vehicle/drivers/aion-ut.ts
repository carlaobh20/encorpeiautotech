import type { VehicleDriver } from './types';

/**
 * ⚠️ DRIVER NÃO VALIDADO — PONTO DE VERDADE PENDENTE ⚠️
 *
 * Os PIDs abaixo são os PADRÕES OBD-II (SAE J1979). Em EVs chineses,
 * a maior parte dos dados críticos (SOC real, corrente, temperatura de
 * célula, SOH) costuma vir de PIDs PROPRIETÁRIOS que só descobriremos
 * no teste com o Car Scanner ELM OBD2 no Aion UT.
 *
 * APÓS O TESTE: substituir/adicionar entradas em `pids` com os códigos
 * reais capturados nos screenshots. Nada mais no app precisa mudar.
 */
export const AION_UT_DRIVER: VehicleDriver = {
  id: 'gac-aion-ut',
  displayName: 'GAC Aion UT',
  // TODO: confirmar capacidade exata do pack na ficha técnica do carro.
  batteryCapacityKwh: 60,
  nominalKmPerKwh: 6.2, // estimativa urbana; será refinada pelo histórico real
  pids: {
    // Padrão OBD-II — podem ou não responder em EV:
    speedKmh: { mode: '01', pid: '0D', parse: 'A' },                 // km/h
    socDisplay: { mode: '01', pid: '5B', parse: 'A*100/255' },       // "fuel level" ≈ SOC de exibição
    // Proprietários (desconhecidos até o teste):
    socReal: null,        // TODO pós-teste
    voltage: null,        // TODO pós-teste
    current: null,        // TODO pós-teste
    batteryTempC: null,   // TODO pós-teste
    soh: null,            // TODO pós-teste
    odometerKm: null,     // TODO pós-teste (PID 01 A6 se suportado)
  },
};

/**
 * Menu Lateral → "Meu veículo" persiste no Supabase e chama isto pra
 * atualizar o driver em uso. Mutação intencional do objeto exportado
 * acima: assim os ~7 arquivos que já leem AION_UT_DRIVER.xxx (appStore,
 * SummaryScreen, NavigationScreen, MockAionDataSource, useCopilot,
 * LiveMap) continuam funcionando sem nenhuma alteração — só passam a
 * ler o valor editado pelo usuário na próxima leitura.
 */
export function applyVehicleProfile(
  patch: Partial<Pick<VehicleDriver, 'displayName' | 'batteryCapacityKwh' | 'nominalKmPerKwh'>>
) {
  Object.assign(AION_UT_DRIVER, patch);
}
