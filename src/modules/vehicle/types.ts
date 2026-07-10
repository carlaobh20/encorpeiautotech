/**
 * Contrato central de dados do veículo.
 * TODO o restante do app (dashboard, trip engine, futura navegação)
 * consome APENAS este formato — nunca dados brutos de Bluetooth/OBD.
 */

export type DriveMode = 'eco' | 'normal' | 'sport' | 'unknown';
export type Gear = 'P' | 'R' | 'N' | 'D' | 'unknown';
export type ChargingState = 'idle' | 'charging_ac' | 'charging_dc' | 'unknown';

export interface VehicleData {
  timestamp: number;          // epoch ms
  soc: number | null;         // % bateria (0-100)
  speedKmh: number | null;
  odometerKm: number | null;
  powerKw: number | null;     // + consumo / - regeneração
  consumptionKwh100: number | null; // consumo instantâneo kWh/100km
  voltage: number | null;     // V do pack
  current: number | null;     // A (+ descarga / - carga)
  batteryTempC: number | null;
  motorTempC: number | null;
  rangeKm: number | null;     // autonomia estimada pelo veículo
  chargingState: ChargingState;
  chargePowerKw: number | null;
  driveMode: DriveMode;
  gear: Gear;
  soh: number | null;         // % saúde da bateria (State of Health)
  cellVoltageMin: number | null; // V da célula mais fraca
  cellVoltageMax: number | null; // V da célula mais forte
  battTempMin: number | null;    // °C do módulo mais frio
  battTempMax: number | null;    // °C do módulo mais quente
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  deviceName: string | null;
  signalQuality: number | null;   // 0-100 (RSSI normalizado)
  lastUpdateAt: number | null;    // epoch ms do último dado válido
  connectedSinceMs: number | null;
  reconnectAttempts: number;
  sourceKind: 'mock' | 'web-bluetooth' | 'native-bridge';
}

export const EMPTY_VEHICLE_DATA: VehicleData = {
  timestamp: 0,
  soc: null,
  speedKmh: null,
  odometerKm: null,
  powerKw: null,
  consumptionKwh100: null,
  voltage: null,
  current: null,
  batteryTempC: null,
  motorTempC: null,
  rangeKm: null,
  chargingState: 'unknown',
  chargePowerKw: null,
  driveMode: 'unknown',
  gear: 'unknown',
  soh: null,
  cellVoltageMin: null,
  cellVoltageMax: null,
  battTempMin: null,
  battTempMax: null,
};
