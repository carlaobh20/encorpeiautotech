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

/** Perfil de conducao (multiplicador de consumo). Editavel em Menu > Perfil de conducao. */
export let DRIVING_PROFILE: 'eco' | 'normal' | 'esportivo' = 'normal';

/** Carga extra media assumida (kg): passageiros/bagagem alem do padrao de 1 pessoa. Editavel em Menu > Uso do veiculo. */
export let EXTRA_LOAD_KG = 0;

/** Cor de destaque do app (var(--teal) injetada em runtime). Editavel em Menu > Aparencia. */
export let THEME_ACCENT = '#3ddcc4';

/** Nome de exibicao do usuario nos cartoes da IA (futuro: perfil). */
export const USER_NAME = 'Carlos';

/** Fator rota real vs linha reta quando nao ha rota calculada. */
export const ROAD_FACTOR = 1.25;

/** Massa aproximada do veiculo + motorista/carga padrao (kg) — usada no calculo
 * fisico de energia de subida/descida (elevacao). Premissa: hatch/SUV compacto
 * eletrico tipico (ex.: GAC Aion UT). [Palpite] ajustavel quando tivermos peso real do veiculo. */
export const VEHICLE_MASS_KG = 1750;

export function applyAppSettings(
  patch: Partial<{
    reserveSocPct: number;
    energyTariffBrlKwh: number;
    gasPriceBrlL: number;
    gasKmPerL: number;
    drivingProfile: 'eco' | 'normal' | 'esportivo';
    extraLoadKg: number;
    themeAccent: string;
  }>
) {
  if (patch.reserveSocPct !== undefined) RESERVE_SOC_PCT = patch.reserveSocPct;
  if (patch.energyTariffBrlKwh !== undefined) ENERGY_TARIFF_BRL_KWH = patch.energyTariffBrlKwh;
  if (patch.gasPriceBrlL !== undefined) GAS_PRICE_BRL_L = patch.gasPriceBrlL;
  if (patch.gasKmPerL !== undefined) GAS_KM_PER_L = patch.gasKmPerL;
  if (patch.drivingProfile !== undefined) DRIVING_PROFILE = patch.drivingProfile;
  if (patch.extraLoadKg !== undefined) EXTRA_LOAD_KG = patch.extraLoadKg;
  if (patch.themeAccent !== undefined) THEME_ACCENT = patch.themeAccent;
}
