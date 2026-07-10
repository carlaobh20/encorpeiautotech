import type { VehicleData } from '../vehicle/types';

/**
 * Trip Engine — consome o fluxo de VehicleData e acumula métricas.
 * Persistência local por enquanto; o formato TripRecord já é o schema
 * planejado para a tabela "trips" no Supabase (sincronização futura).
 */

export interface GeoPoint { lat: number; lng: number; t: number; }

export interface TripRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  durationMs: number;        // exclui pausas
  distanceKm: number;
  energyUsedKwh: number;
  energyRegenKwh: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  socStart: number | null;
  socEnd: number | null;
  origin: GeoPoint | null;       // de onde saiu (GPS)
  destination: GeoPoint | null;  // destino (GPS)
  path: GeoPoint[];              // trajeto completo
  gpsDistanceKm: number;         // distancia medida por GPS
  synced: boolean;           // flag para sync Supabase
}

export type TripState = 'idle' | 'running' | 'paused';

const STORAGE_KEY = 'encorpei-auto:trips';

export class TripEngine {
  state: TripState = 'idle';
  current: TripRecord | null = null;
  private lastTs: number | null = null;
  private speedSum = 0;
  private speedSamples = 0;

  start(initial: VehicleData | null) {
    this.current = {
      id: 'trip_' + Date.now(),
      startedAt: Date.now(),
      endedAt: null,
      durationMs: 0,
      distanceKm: 0,
      energyUsedKwh: 0,
      energyRegenKwh: 0,
      avgSpeedKmh: 0,
      maxSpeedKmh: 0,
      socStart: initial?.soc ?? null,
      socEnd: null,
      origin: null,
      destination: null,
      path: [],
      gpsDistanceKm: 0,
      synced: false,
    };
    this.state = 'running';
    this.lastTs = null;
    this.speedSum = 0;
    this.speedSamples = 0;
  }

  pause() {
    if (this.state === 'running') {
      this.state = 'paused';
      this.lastTs = null;
    }
  }

  resume() {
    if (this.state === 'paused') this.state = 'running';
  }

  /** Adiciona um ponto de GPS ao trajeto da viagem em andamento. */
  addGeo(lat: number, lng: number) {
    if (this.state !== 'running' || !this.current) return;
    const p: GeoPoint = { lat, lng, t: Date.now() };
    if (!this.current.origin) this.current.origin = p;
    const path = this.current.path;
    const last = path[path.length - 1];
    if (!last) { path.push(p); return; }
    const d = haversineKm(last.lat, last.lng, lat, lng);
    if (d > 0.008) { // so registra se andou > 8m (filtra ruido de GPS parado)
      this.current.gpsDistanceKm += d;
      path.push(p);
    }
  }

  finish(last: VehicleData | null): TripRecord | null {
    if (!this.current) return null;
    this.current.endedAt = Date.now();
    this.current.socEnd = last?.soc ?? null;
    const path = this.current.path;
    if (path.length && !this.current.destination) {
      this.current.destination = path[path.length - 1];
    }
    const finished = this.current;
    saveTrip(finished);
    this.current = null;
    this.state = 'idle';
    return finished;
  }

  /** Chamar a cada VehicleData recebido. */
  ingest(data: VehicleData) {
    if (this.state !== 'running' || !this.current) return;
    const t = this.current;

    if (this.lastTs !== null) {
      const dtH = (data.timestamp - this.lastTs) / 3_600_000;
      if (dtH > 0 && dtH < 0.01) { // ignora gaps > 36s (perda de sinal)
        t.durationMs += data.timestamp - this.lastTs;
        if (data.speedKmh !== null) t.distanceKm += data.speedKmh * dtH;
        if (data.powerKw !== null) {
          if (data.powerKw >= 0) t.energyUsedKwh += data.powerKw * dtH;
          else t.energyRegenKwh += -data.powerKw * dtH;
        }
      }
    }
    this.lastTs = data.timestamp;

    if (data.speedKmh !== null) {
      this.speedSum += data.speedKmh;
      this.speedSamples++;
      t.avgSpeedKmh = this.speedSum / this.speedSamples;
      t.maxSpeedKmh = Math.max(t.maxSpeedKmh, data.speedKmh);
    }
  }
}

export function loadTrips(): TripRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveTrip(trip: TripRecord) {
  const all = loadTrips();
  all.unshift(trip);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 200)));
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
