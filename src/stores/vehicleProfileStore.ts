import { create } from 'zustand';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config';
import { AION_UT_DRIVER, applyVehicleProfile } from '../modules/vehicle/drivers/aion-ut';

/**
 * Persistência do perfil do veículo (tabela `vehicles` no Supabase).
 *
 * Fatia vertical do Menu Lateral: só "Meu veículo" está realmente
 * salvando no banco. Autosave debounced (500ms), sem botão salvar,
 * como pedido no prompt do menu. Cada edição também chama
 * applyVehicleProfile() na hora — o cálculo de autonomia reflete
 * a mudança antes mesmo do Supabase confirmar o save.
 */

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const VEHICLE_ID = AION_UT_DRIVER.id;
const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface VehicleProfilePatch {
  displayName?: string;
  batteryCapacityKwh?: number;
  nominalKmPerKwh?: number;
}

interface VehicleProfileStore {
  displayName: string;
  batteryCapacityKwh: number;
  nominalKmPerKwh: number;
  loaded: boolean;
  saving: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  update: (patch: VehicleProfilePatch) => void;
}

export const useVehicleProfileStore = create<VehicleProfileStore>((set, get) => ({
  displayName: AION_UT_DRIVER.displayName,
  batteryCapacityKwh: AION_UT_DRIVER.batteryCapacityKwh,
  nominalKmPerKwh: AION_UT_DRIVER.nominalKmPerKwh,
  loaded: false,
  saving: false,
  loadError: null,

  load: async () => {
    const { data, error } = await client
      .from('vehicles')
      .select('display_name, battery_capacity_kwh, nominal_km_per_kwh')
      .eq('id', VEHICLE_ID)
      .maybeSingle();

    if (error || !data) {
      // Sem linha ainda (ou offline): segue com os valores hardcoded do driver.
      set({ loaded: true, loadError: error ? error.message : null });
      return;
    }

    const patch: Required<VehicleProfilePatch> = {
      displayName: data.display_name,
      batteryCapacityKwh: Number(data.battery_capacity_kwh),
      nominalKmPerKwh: Number(data.nominal_km_per_kwh),
    };
    applyVehicleProfile(patch);
    set({ ...patch, loaded: true, loadError: null });
  },

  update: (patch) => {
    set((st) => ({ ...st, ...patch }));
    applyVehicleProfile(patch);

    if (saveTimer) clearTimeout(saveTimer);
    set({ saving: true });
    saveTimer = setTimeout(async () => {
      const st = get();
      await client.from('vehicles').upsert({
        id: VEHICLE_ID,
        display_name: st.displayName,
        battery_capacity_kwh: st.batteryCapacityKwh,
        nominal_km_per_kwh: st.nominalKmPerKwh,
        updated_at: new Date().toISOString(),
      });
      set({ saving: false });
    }, SAVE_DEBOUNCE_MS);
  },
}));

