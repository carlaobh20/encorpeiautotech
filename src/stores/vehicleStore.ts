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
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startTrip: () => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  finishTrip: () => void;
}

const source = createSource();
const tripEngine = new TripEngine();

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

    connect: () => source.connect(),
    disconnect: () => source.disconnect(),

    startTrip: () => {
      tripEngine.start(get().data);
      set({ tripState: 'running', currentTrip: { ...tripEngine.current! } });
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
      tripEngine.finish(get().data);
      set({ tripState: 'idle', currentTrip: null, tripHistory: loadTrips() });
    },
  };
});
