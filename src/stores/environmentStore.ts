import { create } from 'zustand';
import type { EnvironmentInput } from '../modules/intelligence/EnvironmentFactors';

/**
 * environmentStore — os ajustes manuais de clima/carga que o motorista informa.
 *
 * Mesmo padrão do manualSoc no vehicleStore: o motorista ajusta uma vez,
 * persiste em localStorage, e todo o copiloto (PredictionEngine,
 * EnergyHorizon, ConfidenceEngine) recalcula na hora — sem depender de
 * nenhum sensor. Default = tudo vazio = sem efeito na previsão.
 */

const ENV_KEY = 'encorpei-auto:environment';

function loadEnvironment(): EnvironmentInput {
  try {
    const v = JSON.parse(localStorage.getItem(ENV_KEY) ?? 'null');
    if (v && typeof v === 'object') return v as EnvironmentInput;
  } catch { /* primeiro uso */ }
  return {};
}

function saveEnvironment(v: EnvironmentInput) {
  try { localStorage.setItem(ENV_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

interface EnvironmentStore {
  environment: EnvironmentInput;
  /** Atualiza só os campos informados; undefined explícito remove o campo. */
  setEnvironment: (patch: Partial<EnvironmentInput>) => void;
  resetEnvironment: () => void;
}

export const useEnvironmentStore = create<EnvironmentStore>((set, get) => ({
  environment: loadEnvironment(),

  setEnvironment: (patch) => {
    const next: EnvironmentInput = { ...get().environment, ...patch };
    (Object.keys(next) as (keyof EnvironmentInput)[]).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    saveEnvironment(next);
    set({ environment: next });
  },

  resetEnvironment: () => {
    saveEnvironment({});
    set({ environment: {} });
  },
}));
