import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config';
import {
  RESERVE_SOC_PCT,
  ENERGY_TARIFF_BRL_KWH,
  GAS_PRICE_BRL_L,
  GAS_KM_PER_L,
  DRIVING_PROFILE,
  EXTRA_LOAD_KG,
  THEME_ACCENT,
  applyAppSettings,
} from '../config/assumptions';

/**
 * Persiste as premissas de "Consumo e bateria", "Carregamento", "Perfil de
 * conducao", "Uso do veiculo" e "Aparencia" do Menu Lateral no Supabase
 * (tabela app_settings, linha unica id='default'), mesmo padrao de debounce
 * (500ms) e mutacao ao vivo do vehicleProfileStore.
 */

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const SETTINGS_ID = 'default';
const SAVE_DEBOUNCE_MS = 500;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export type DrivingProfile = 'eco' | 'normal' | 'esportivo';

interface AppSettingsPatch {
  reserveSocPct?: number;
  energyTariffBrlKwh?: number;
  gasPriceBrlL?: number;
  gasKmPerL?: number;
  drivingProfile?: DrivingProfile;
  extraLoadKg?: number;
  themeAccent?: string;
}

interface AppSettingsStore {
  reserveSocPct: number;
  energyTariffBrlKwh: number;
  gasPriceBrlL: number;
  gasKmPerL: number;
  drivingProfile: DrivingProfile;
  extraLoadKg: number;
  themeAccent: string;
  loaded: boolean;
  saving: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  update: (patch: AppSettingsPatch) => void;
}

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  reserveSocPct: RESERVE_SOC_PCT,
  energyTariffBrlKwh: ENERGY_TARIFF_BRL_KWH,
  gasPriceBrlL: GAS_PRICE_BRL_L,
  gasKmPerL: GAS_KM_PER_L,
  drivingProfile: DRIVING_PROFILE,
  extraLoadKg: EXTRA_LOAD_KG,
  themeAccent: THEME_ACCENT,
  loaded: false,
  saving: false,
  loadError: null,

  load: async () => {
    const { data, error } = await client
      .from('app_settings')
      .select('reserve_soc_pct, energy_tariff_brl_kwh, gas_price_brl_l, gas_km_per_l, driving_profile, extra_load_kg, theme_accent')
      .eq('id', SETTINGS_ID)
      .maybeSingle();
    if (error || !data) {
      set({ loaded: true, loadError: error ? error.message : null });
      return;
    }
    const patch: AppSettingsPatch = {
      reserveSocPct: Number(data.reserve_soc_pct),
      energyTariffBrlKwh: Number(data.energy_tariff_brl_kwh),
      gasPriceBrlL: Number(data.gas_price_brl_l),
      gasKmPerL: Number(data.gas_km_per_l),
      drivingProfile: (data.driving_profile as DrivingProfile) ?? 'normal',
      extraLoadKg: Number(data.extra_load_kg ?? 0),
      themeAccent: (data.theme_accent as string) ?? '#3ddcc4',
    };
    applyAppSettings(patch);
    set({ ...patch, loaded: true, loadError: null });
  },

  update: (patch) => {
    set((st) => ({ ...st, ...patch }));
    applyAppSettings(patch);
    if (saveTimer) clearTimeout(saveTimer);
    set({ saving: true });
    saveTimer = setTimeout(async () => {
      const st = get();
      await client.from('app_settings').upsert({
        id: SETTINGS_ID,
        reserve_soc_pct: st.reserveSocPct,
        energy_tariff_brl_kwh: st.energyTariffBrlKwh,
        gas_price_brl_l: st.gasPriceBrlL,
        gas_km_per_l: st.gasKmPerL,
        driving_profile: st.drivingProfile,
        extra_load_kg: st.extraLoadKg,
        theme_accent: st.themeAccent,
        updated_at: new Date().toISOString(),
      });
      set({ saving: false });
    }, SAVE_DEBOUNCE_MS);
  },
}));
