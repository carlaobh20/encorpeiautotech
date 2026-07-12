import { create } from 'zustand';
import type { ConnectionStatus, VehicleData } from '../modules/vehicle/types';
import { EMPTY_VEHICLE_DATA } from '../modules/vehicle/types';
import type { VehicleDataSource } from '../modules/vehicle/datasource/VehicleDataSource';
import { MockAionDataSource } from '../modules/vehicle/datasource/MockAionDataSource';
import { SupabaseRealtimeSource } from '../modules/vehicle/datasource/SupabaseRealtimeSource';
import { TripEngine, loadTrips, type TripRecord, type TripState } from '../modules/trip/TripEngine';

/**
 * Store global. A UI lê daqui; os serviços escrevem aqui.
 * Trocar a fonte de dados (mock → Web Bluetooth → ponte nativa)
 * é trocar UMA linha em createSource().
 *
 * SOC manual: quando NÃO há Vgate, o motorista informa a bateria uma vez
 * (slider) e o copiloto passa a ESTIMAR a descarga pelo modelo de energia.
 * Assim o produto inteiro funciona hoje, antes da validação do hardware.
 */

function createSource(): VehicleDataSource {
    // Fonte real: Vehicle Gateway publica no Supabase Realtime.
    // Para demonstracao sem carro, abra o app com ?source=mock
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'mock') return new MockAionDataSource();
    return new SupabaseRealtimeSource();
}

const MANUAL_SOC_KEY = 'encorpei-auto:manual-soc';

function loadManualSoc(): number | null {
  try {
    const v = Number(localStorage.getItem(MANUAL_SOC_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

interface VehicleStore {
  data: VehicleData;
  status: ConnectionStatus;
  tripState: TripState;
  currentTrip: TripRecord | null;
  tripHistory: TripRecord[];
  /** Viagem exibida no Resumo (recem-encerrada ou aberta pelo historico). */
  summaryTrip: TripRecord | null;
  /** SOC informado pelo motorista quando nao ha telemetria. */
  manualSoc: number | null;
  /** true assim que o carro entregar UM soc real — o manual sai de cena. */
  hasTelemetrySoc: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startTrip: () => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  finishTrip: () => void;
  openSummary: (trip: TripRecord) => void;
  closeSummary: () => void;
  setManualSoc: (v: number) => void;
  /** Descarga estimada pelo modelo durante a navegacao (so sem telemetria). */
  setEstimatedSoc: (v: number) => void;
}

const source = createSource();
const tripEngine = new TripEngine();

// --- Captura de GPS do proprio aparelho (independente do Vgate) ---
let geoWatchId: number | null = null;
function startGeo(onPoint: () => void) {
  if (!('geolocation' in navigator)) return;
  stopGeo();
  try {
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => { tripEngine.addGeo(pos.coords.latitude, pos.coords.longitude); onPoint(); },
      () => { /* permissao negada / sem sinal: viagem segue sem mapa */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
    );
  } catch { /* ignore */ }
}
function stopGeo() {
  if (geoWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

const clampSoc = (v: number) => Math.max(0, Math.min(100, v));

export const useVehicleStore = create<VehicleStore>((set, get) => {
  source.onData((data) => {
    const st = get();
    const telem = data.soc !== null;
    // Sem soc do carro: preserva o soc corrente (manual/estimado) em vez de apagar.
    const merged = telem ? data : { ...data, soc: st.data.soc ?? st.manualSoc };
    tripEngine.ingest(merged);
    set({
      data: merged,
      hasTelemetrySoc: telem ? true : st.hasTelemetrySoc,
      currentTrip: tripEngine.current ? { ...tripEngine.current } : null,
    });
  });

  source.onStatus((status) => set({ status: { ...status } }));

  const initialManual = loadManualSoc();

  return {
    data: initialManual !== null ? { ...EMPTY_VEHICLE_DATA, soc: initialManual } : EMPTY_VEHICLE_DATA,
    status: source.getStatus(),
    tripState: 'idle',
    currentTrip: null,
    tripHistory: loadTrips(),
    summaryTrip: null,
    manualSoc: initialManual,
    hasTelemetrySoc: false,

    connect: () => source.connect(),
    disconnect: () => source.disconnect(),

    startTrip: () => {
      tripEngine.start(get().data);
      set({ tripState: 'running', currentTrip: { ...tripEngine.current! } });
      startGeo(() => set({ currentTrip: tripEngine.current ? { ...tripEngine.current } : null }));
    },
    pauseTrip: () => {
      tripEngine.pause();
      set({ tripState: 'paused' });
    },
    resumeTrip: () => {
      tripEngine.resume();
      set({ tripState: 'running' });
    },
    finishTrip: () => {
      stopGeo();
      const finished = tripEngine.finish(get().data);
      const st = get();
      // Sem telemetria: o soc estimado da chegada vira o novo soc manual.
      if (!st.hasTelemetrySoc && st.data.soc !== null) {
        try { localStorage.setItem(MANUAL_SOC_KEY, String(Math.round(st.data.soc))); } catch { /* ignore */ }
      }
      set({
        tripState: 'idle',
        currentTrip: null,
        tripHistory: loadTrips(),
        manualSoc: !st.hasTelemetrySoc && st.data.soc !== null ? Math.round(st.data.soc) : st.manualSoc,
        // Ao encerrar, o Resumo de viagem abre automaticamente.
        summaryTrip: finished,
      });
    },

    openSummary: (trip) => set({ summaryTrip: trip }),
    closeSummary: () => set({ summaryTrip: null }),

    setManualSoc: (v) => {
      const soc = Math.round(clampSoc(v));
      try { localStorage.setItem(MANUAL_SOC_KEY, String(soc)); } catch { /* ignore */ }
      const st = get();
      set({ manualSoc: soc, data: st.hasTelemetrySoc ? st.data : { ...st.data, soc } });
    },

    setEstimatedSoc: (v) => {
      const st = get();
      if (st.hasTelemetrySoc) return; // telemetria real sempre vence
      set({ data: { ...st.data, soc: Math.round(clampSoc(v) * 10) / 10 } });
    },
  };
});

