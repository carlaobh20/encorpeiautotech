import { create } from 'zustand';

/**
 * Localizacao do aparelho + destino escolhido.
 * O GPS do celular e independente do Vgate: o cockpit funciona mesmo
 * antes da conectividade real com o carro.
 */

export interface DevicePosition {
  lat: number;
  lng: number;
  headingDeg: number | null;  // direcao do movimento (0 = norte)
  speedKmh: number | null;    // velocidade medida pelo GPS
  accuracyM: number | null;
  t: number;
}

export interface Destination { lat: number; lng: number; name: string | null; }

const DEST_KEY = 'encorpei-auto:destination';

function loadDestination(): Destination | null {
  try { return JSON.parse(localStorage.getItem(DEST_KEY) ?? 'null'); } catch { return null; }
}

interface LocationStore {
  position: DevicePosition | null;
  destination: Destination | null;
  follow: boolean;                 // camera do mapa segue o carro
  geoState: 'idle' | 'watching' | 'denied';
  setDestination: (d: Destination | null) => void;
  setDestinationName: (name: string) => void;
  setFollow: (v: boolean) => void;
  startWatch: () => void;
  stopWatch: () => void;
}

let watchId: number | null = null;

export const useLocationStore = create<LocationStore>((set, get) => ({
  position: null,
  destination: loadDestination(),
  follow: true,
  geoState: 'idle',

  setDestination: (d) => {
    if (d) localStorage.setItem(DEST_KEY, JSON.stringify(d));
    else localStorage.removeItem(DEST_KEY);
    set({ destination: d });
  },

  setDestinationName: (name) => {
    const d = get().destination;
    if (!d) return;
    const next = { ...d, name };
    localStorage.setItem(DEST_KEY, JSON.stringify(next));
    set({ destination: next });
  },

  setFollow: (v) => set({ follow: v }),

  startWatch: () => {
    if (watchId !== null || !('geolocation' in navigator)) return;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          set({
            geoState: 'watching',
            position: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              headingDeg: pos.coords.heading ?? null,
              speedKmh: pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : null,
              accuracyM: pos.coords.accuracy ?? null,
              t: Date.now(),
            },
          });
        },
        (err) => { if (err.code === err.PERMISSION_DENIED) set({ geoState: 'denied' }); },
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 15000 }
      );
    } catch { /* sem GPS: cockpit segue funcionando sem mapa centrado */ }
  },

  stopWatch: () => {
    if (watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      set({ geoState: 'idle' });
    }
  },
}));
