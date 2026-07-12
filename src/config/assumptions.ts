/**
 * Premissas economicas e fisicas do produto — TODAS num lugar so,
 * com fonte/justificativa. Quando um dado real chegar (tarifa do usuario,
 * PIDs validados, API de clima), ele substitui a premissa aqui.
 */

/** Tarifa residencial media de energia (R$/kWh). Ajustavel pelo usuario no futuro. */
export const ENERGY_TARIFF_BRL_KWH = 0.92;

/** Gasolina: preco medio (R$/L) e rendimento de um carro a combustao comparavel. */
export const GAS_PRICE_BRL_L = 6.19;
export const GAS_KM_PER_L = 11.5;

/** Reserva de bateria que o copiloto trata como intocavel (%). */
export const RESERVE_SOC_PCT = 10;

/** Nome de exibicao do usuario nos cartoes da IA (futuro: perfil). */
export const USER_NAME = 'Carlos';

/** Fator rota real vs linha reta quando nao ha rota calculada. */
export const ROAD_FACTOR = 1.25;
