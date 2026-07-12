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
 */

function createSource(): VehicleDataSource {
    // Fonte real: Vehicle Gateway publica no Supabase Realtime.
    // Para demonstracao sem carro, abra o app com ?source=mock
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'mock') return new MockAionDataSource();
    return new SupabaseRealtimeSource();
}

interface VehicleStore {
  data: VehicleData;
  status: ConnectionStatus;
  tripState: TripState;
  currentTrip: TripRecord | null;
  tripHistory: TripRecord[];
  /** Viagem exibida no Resumo (recem-encerrada ou aberta pelo historico). */
  summaryTrip: TripRecord | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startTrip: () => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  finishTrip: () => void;
  openSummary: (trip: TripRecord) => void;
  closeSummary: () => void;
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

export const useVehicleStore = create<VehicleStore>((set, get) => {
  source.onData((data) => {
    tripEngine.ingest(data);
    set({
      data,
      currentTrip: tripEngine.current ? { ...tripEngine.current } : null,
    });
  });

  source.onStatus((status) => set({ status: { ...status } }));

  return {
    data: EMPTY_VEHICLE_DATA,
    status: source.getStatus(),
    tripState: 'idle',
    currentTrip: null,
    tripHistory: loadTrips(),
    summaryTrip: null,

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
      set({
        tripState: 'idle',
        currentTrip: null,
        tripHistory: loadTrips(),
        // Ao encerrar, o Resumo de viagem abre automaticamente.
        summaryTrip: finished,
      });
    },

    openSummary: (trip) => set({ summaryTrip: trip }),
    closeSummary: () => set({ summaryTrip: null }),
  };
});
