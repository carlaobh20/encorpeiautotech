import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { BaseDataSource } from './VehicleDataSource';
import { EMPTY_VEHICLE_DATA, type VehicleData } from '../types';
import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  VEHICLE_CHANNEL,
  TELEMETRY_EVENT,
} from '../../../config';

/**
 * Fonte de dados via Supabase Realtime.
 *
 * O Vehicle Gateway (processo independente — desktop, Android,
 * Raspberry Pi, qualquer coisa) lê o Vgate e publica VehicleData
 * neste canal. O PWA apenas assina e exibe. Nenhuma linha do PWA
 * muda quando o Gateway trocar de plataforma.
 */

const STALE_MS = 6000; // sem dados por 6s → "aguardando gateway"

export class SupabaseRealtimeSource extends BaseDataSource {
  private channel: RealtimeChannel | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  async connect() {
    this.setStatus({
      state: 'connecting',
      sourceKind: 'native-bridge',
      deviceName: 'Vehicle Gateway',
    });

    this.channel = this.client
      .channel(VEHICLE_CHANNEL)
      .on('broadcast', { event: TELEMETRY_EVENT }, ({ payload }) => {
        const data = sanitize(payload);
        if (!data) return;
        if (this.status.state !== 'connected') {
          this.setStatus({ state: 'connected', connectedSinceMs: Date.now() });
        }
        this.emitData(data);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Canal aberto; "connected" de fato só quando o 1º dado chegar
          this.setStatus({ state: 'reconnecting' }); // exibido como "aguardando"
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.setStatus({
            state: 'error',
            reconnectAttempts: this.status.reconnectAttempts + 1,
          });
        }
      });

    // Detecta gateway silencioso (carro desligado, gateway parado)
    this.staleTimer = setInterval(() => {
      const last = this.status.lastUpdateAt;
      if (this.status.state === 'connected' && last && Date.now() - last > STALE_MS) {
        this.setStatus({ state: 'reconnecting' });
      }
    }, 2000);
  }

  async disconnect() {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
    if (this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus({ state: 'disconnected', connectedSinceMs: null });
  }
}

/** Nunca confiar cegamente no payload da rede: valida e normaliza. */
function sanitize(payload: unknown): VehicleData | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const data: VehicleData = {
    ...EMPTY_VEHICLE_DATA,
    timestamp: num(p.timestamp) ?? Date.now(),
    soc: num(p.soc),
    speedKmh: num(p.speedKmh),
    odometerKm: num(p.odometerKm),
    powerKw: num(p.powerKw),
    consumptionKwh100: num(p.consumptionKwh100),
    voltage: num(p.voltage),
    current: num(p.current),
    batteryTempC: num(p.batteryTempC),
    motorTempC: num(p.motorTempC),
    rangeKm: num(p.rangeKm),
    chargePowerKw: num(p.chargePowerKw),
    soh: num(p.soh),
    cellVoltageMin: num(p.cellVoltageMin),
    cellVoltageMax: num(p.cellVoltageMax),
    battTempMin: num(p.battTempMin),
    battTempMax: num(p.battTempMax),
    chargingState: typeof p.chargingState === 'string' ? (p.chargingState as VehicleData['chargingState']) : 'unknown',
    driveMode: typeof p.driveMode === 'string' ? (p.driveMode as VehicleData['driveMode']) : 'unknown',
    gear: typeof p.gear === 'string' ? (p.gear as VehicleData['gear']) : 'unknown',
  };
  return data;
}
