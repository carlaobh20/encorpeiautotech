/**
 * Premissas economicas e fisicas do produto — TODAS num lugar so,
 * com fonte/justificativa. Quando um dado real chegar (tarifa do usuario,
 * PIDs validados, API de clima), ele substitui a premissa aqui.
 *
 * RESERVE_SOC_PCT, ENERGY_TARIFF_BRL_KWH, GAS_PRICE_BRL_L e GAS_KM_PER_L
 * agora sao `let` (nao `const`): o Menu Lateral -> Consumo e bateria /
 * Carregamento persiste esses valores no Supabase e chama applyAppSettings()
 * pra atualizar aqui. Os arquivos que ja importam essas constantes
 * (PlanningScreen, NavigationScreen, useCopilot, SummaryScreen) continuam
 * funcionando sem alteracao: bindings de modulo ES sao "live", entao o
 * valor novo aparece automaticamente na proxima leitura/render.
 */

/** Tarifa residencial media de energia (R$/kWh). Editavel em Menu > Carregamento. */
export let ENERGY_TARIFF_BRL_KWH = 0.92;

/** Gasolina: preco medio (R$/L) e rendimento de um carro a combustao comparavel. Editavel em Menu > Carregamento. */
export let GAS_PRICE_BRL_L = 6.19;
export let GAS_KM_PER_L = 11.5;

/** Reserva de bateria que o copiloto trata como intocavel (%). Editavel em Menu > Consumo e bateria. */
export let RESERVE_SOC_PCT = 10;

/** Nome de exibicao do usuario nos cartoes da IA (futuro: perfil). */
export const USER_NAME = 'Carlos';

/** Fator rota real vs linha reta quando nao ha rota calculada. */
export const ROAD_FACTOR = 1.25;

export function applyAppSettings(
  patch: Partial<{
    reserveSocPct: number;
    energyTariffBrlKwh: number;
    gasPriceBrlL: number;
    gasKmPerL: number;
  }>
) {
  if (patch.reserveSocPct !== undefined) RESERVE_SOC_PCT = patch.reserveSocPct;
  if (patch.energyTariffBrlKwh !== undefined) ENERGY_TARIFF_BRL_KWH = patch.energyTariffBrlKwh;
  if (patch.gasPriceBrlL !== undefined) GAS_PRICE_BRL_L = patch.gasPriceBrlL;
  if (patch.gasKmPerL !== undefined) GAS_KM_PER_L = patch.gasKmPerL;
}
