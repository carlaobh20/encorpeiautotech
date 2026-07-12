/**
 * appStore — a maquina de estados da EXPERIENCIA UNICA.
 *
 *   search → planning → navigation → summary → search
 *
 * A tela nao muda por menu: muda por contexto. Este store e o unico
 * dono do modo atual, do destino, do plano de rota e do feed da IA.
 */

import { create } from 'zustand';
import { fetchRoute, computeProgress, type RoutePlan, type NavProgress } from '../modules/navigation/NavigationEngine';
import { DriveSimulator } from '../modules/navigation/DriveSimulator';
import { findChargers, type Charger } from '../modules/charging/ChargingEngine';
import { CopilotFeed, type CopilotCard } from '../modules/intelligence/CopilotAI';
import type { LatLng } from '../modules/navigation/geo';
import { useLocationStore } from './locationStore';
import { useVehicleStore } from './vehicleStore';
import { sampleBuffer } from '../modules/telemetry/SampleBuffer';

export type AppMode = 'search' | 'planning' | 'navigation' | 'summary';

export interface Place { name: string; lat: number; lng: number; }

const FAV_KEY = 'encorpei-auto:places';

interface SavedPlaces { home: Place | null; work: Place | null; recents: Place[]; favorites: Place[]; }

function loadPlaces(): SavedPlaces {
  try {
    const p = JSON.parse(localStorage.getItem(FAV_KEY) ?? 'null');
    if (p) return p;
  } catch { /* primeiro uso */ }
  return { home: null, work: null, recents: [], favorites: [] };
}

function savePlaces(p: SavedPlaces) { localStorage.setItem(FAV_KEY, JSON.stringify(p)); }

export const copilotFeed = new CopilotFeed();
export const driveSim = new DriveSimulator();

interface AppStore {
  mode: AppMode;
  destination: Place | null;
  plan: RoutePlan | null;
  planning: boolean;
  planError: string | null;
  progress: NavProgress | null;
  chargers: Charger[];
  chargersLoading: boolean;
  cards: CopilotCard[];
  places: SavedPlaces;
  isMock: boolean;

  chooseDestination: (p: Place) => Promise<void>;
  startNavigation: () => void;
  cancelPlanning: () => void;
  endNavigation: () => void;       // chegada ou encerramento manual → summary
  closeSummary: () => void;
  setProgress: (p: NavProgress) => void;
  pushCard: (c: CopilotCard) => void;
  expireCards: () => void;
  setHome: (p: Place) => void;
  setWork: (p: Place) => void;
  loadChargersNear: (at: LatLng) => Promise<void>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  mode: 'search',
  destination: null,
  plan: null,
  planning: false,
  planError: null,
  progress: null,
  chargers: [],
  chargersLoading: false,
  cards: [],
  places: loadPlaces(),
  isMock: new URLSearchParams(window.location.search).get('source') === 'mock',

  chooseDestination: async (dest) => {
    const pos = useLocationStore.getState().position;
    // Sem GPS ainda: usa o centro padrao (o simulador dirige a rota mesmo assim)
    const from: LatLng = pos ? { lat: pos.lat, lng: pos.lng } : { lat: -19.9167, lng: -43.9345 };
    set({ mode: 'planning', destination: dest, planning: true, planError: null, plan: null });
    try {
      const plan = await fetchRoute(from, { lat: dest.lat, lng: dest.lng }, dest.name);
      // registra nos recentes
      const places = { ...get().places };
      places.recents = [dest, ...places.recents.filter((r) => r.name !== dest.name)].slice(0, 6);
      savePlaces(places);
      set({ plan, planning: false, places });
    } catch (e: any) {
      set({ planning: false, planError: e?.message ?? 'Não foi possível calcular a rota.' });
    }
  },

  startNavigation: () => {
    const { plan, isMock } = get();
    if (!plan) return;
    copilotFeed.reset();
    sampleBuffer.clear();
    useVehicleStore.getState().startTrip();
    useLocationStore.getState().setFollow(true);
    set({ mode: 'navigation', progress: null, cards: [] });

    // No modo demo o simulador DIRIGE a rota real — produto testavel sem carro.
    if (isMock) {
      driveSim.start(plan, (pose) => {
        useLocationStore.setState({
          position: { lat: pose.lat, lng: pose.lng, headingDeg: pose.headingDeg, speedKmh: pose.speedKmh, accuracyM: 5, t: Date.now() },
          geoState: 'watching',
        });
      }, 6 /* 6x mais rapido: demo confortavel */);
    }
  },

  cancelPlanning: () => set({ mode: 'search', destination: null, plan: null, planError: null }),

  endNavigation: () => {
    driveSim.stop();
    useVehicleStore.getState().finishTrip(); // abre summaryTrip no vehicleStore
    set({ mode: 'summary', progress: null, cards: [] });
  },

  closeSummary: () => {
    useVehicleStore.getState().closeSummary();
    set({ mode: 'search', destination: null, plan: null, progress: null });
  },

  setProgress: (p) => set({ progress: p }),

  pushCard: (c) => set({ cards: [...get().cards.filter((x) => x.id !== c.id), c].slice(-2) }),

  expireCards: () => {
    const now = Date.now();
    const alive = get().cards.filter((c) => now - c.createdAt < c.ttlMs);
    if (alive.length !== get().cards.length) set({ cards: alive });
  },

  setHome: (p) => {
    const places = { ...get().places, home: p };
    savePlaces(places); set({ places });
  },
  setWork: (p) => {
    const places = { ...get().places, work: p };
    savePlaces(places); set({ places });
  },

  loadChargersNear: async (at) => {
    set({ chargersLoading: true });
    const chargers = await findChargers(at);
    set({ chargers, chargersLoading: false });
  },
}));

/** Geocodificacao (Nominatim, gratuito) com vies para perto do usuario. */
export async function geocode(q: string): Promise<Place[]> {
  const pos = useLocationStore.getState().position;
  let url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=br&q=' + encodeURIComponent(q);
  if (pos) {
    const d = 1.2;
    url += '&viewbox=' + (pos.lng - d) + ',' + (pos.lat + d) + ',' + (pos.lng + d) + ',' + (pos.lat - d);
  }
  try {
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    const j = await r.json();
    return (j as any[]).map((it) => ({
      name: String(it.display_name).split(',').slice(0, 3).join(','),
      lat: parseFloat(it.lat),
      lng: parseFloat(it.lon),
    }));
  } catch {
    return [];
  }
}
