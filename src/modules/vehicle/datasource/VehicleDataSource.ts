import type { ConnectionStatus, VehicleData } from '../types';

/**
 * ABSTRAÇÃO CENTRAL DE FONTE DE DADOS.
 *
 * Por que existe: iOS NÃO permite Web Bluetooth em PWA. Portanto o PWA
 * nunca fala direto com o dongle no iPhone. As fontes possíveis são:
 *
 *  1. MockAionDataSource  — simulador realista (desenvolvimento). ✅ implementado
 *  2. WebBluetoothSource  — Android/Chrome desktop, fala com o Vgate. ⏳ futuro
 *  3. NativeBridgeSource  — app nativo iOS coleta via BLE e publica em
 *     Supabase Realtime; o PWA assina o canal. ⏳ futuro
 *
 * Nenhuma tela conhece a implementação — só esta interface.
 */
export interface VehicleDataSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(listener: (data: VehicleData) => void): () => void;
  onStatus(listener: (status: ConnectionStatus) => void): () => void;
  getStatus(): ConnectionStatus;
}

/** Base com gerenciamento de listeners, comum a todas as fontes. */
export abstract class BaseDataSource implements VehicleDataSource {
  private dataListeners = new Set<(d: VehicleData) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();

  protected status: ConnectionStatus = {
    state: 'disconnected',
    deviceName: null,
    signalQuality: null,
    lastUpdateAt: null,
    connectedSinceMs: null,
    reconnectAttempts: 0,
    sourceKind: 'mock',
  };

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  onData(listener: (d: VehicleData) => void) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onStatus(listener: (s: ConnectionStatus) => void) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getStatus() {
    return this.status;
  }

  protected emitData(data: VehicleData) {
    this.status = { ...this.status, lastUpdateAt: data.timestamp };
    this.dataListeners.forEach((l) => l(data));
  }

  protected setStatus(patch: Partial<ConnectionStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((l) => l(this.status));
  }
}
