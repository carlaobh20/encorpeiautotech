import { BaseDataSource } from './VehicleDataSource';
import { AION_UT_DRIVER } from '../drivers/aion-ut';
import type { VehicleData } from '../types';

/**
 * Simulador do GAC Aion UT.
 * Gera um ciclo de condução urbano plausível: parado → acelerando →
 * cruzeiro → frenagem (com regeneração) → parado. O SOC cai pela
 * integral da potência sobre a capacidade do pack.
 *
 * Serve para desenvolver dashboard, trip engine e algoritmo de bateria
 * ANTES de os PIDs reais serem validados no carro.
 */

type Phase = 'stopped' | 'accelerating' | 'cruising' | 'braking';

const TICK_MS = 500;

export class MockAionDataSource extends BaseDataSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private phase: Phase = 'stopped';
  private phaseTicks = 0;
  private speed = 0;          // km/h
  private targetSpeed = 0;
  private soc = 78.4;         // % inicial
  private odometer = 12408;   // km
  private batteryTemp = 28;
  private motorTemp = 34;

  async connect() {
    this.setStatus({ state: 'connecting', sourceKind: 'mock', deviceName: 'Aion UT (simulado)' });
    await sleep(900); // simula handshake BLE
    this.setStatus({
      state: 'connected',
      signalQuality: 92,
      connectedSinceMs: Date.now(),
      reconnectAttempts: 0,
    });
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  async disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setStatus({ state: 'disconnected', connectedSinceMs: null });
  }

  private tick() {
    this.advancePhase();

    // Suaviza velocidade em direção ao alvo
    const accel = this.phase === 'braking' ? 1.4 : 0.9; // km/h por tick
    if (this.speed < this.targetSpeed) this.speed = Math.min(this.targetSpeed, this.speed + accel * 2.2);
    else if (this.speed > this.targetSpeed) this.speed = Math.max(this.targetSpeed, this.speed - accel * 3.0);

    // Potência: função da fase e velocidade (+ ruído)
    let powerKw: number;
    if (this.phase === 'accelerating') powerKw = 18 + this.speed * 0.45 + noise(4);
    else if (this.phase === 'cruising') powerKw = 4 + this.speed * 0.16 + noise(1.5);
    else if (this.phase === 'braking') powerKw = -(6 + this.speed * 0.22) + noise(2); // regeneração
    else powerKw = 0.6 + noise(0.2); // consumo auxiliar parado

    // Integrais
    const hours = TICK_MS / 3_600_000;
    const packKwh = AION_UT_DRIVER.batteryCapacityKwh;
    this.soc = clamp(this.soc - (powerKw * hours * 100) / packKwh, 0, 100);
    this.odometer += this.speed * hours;

    // Térmica simples
    this.batteryTemp += (Math.abs(powerKw) > 25 ? 0.01 : -0.005);
    this.motorTemp += (Math.abs(powerKw) > 25 ? 0.03 : -0.015);

    const voltage = 340 + (this.soc / 100) * 60 + noise(0.5);
    const current = (powerKw * 1000) / voltage;
    const consumption = this.speed > 3 ? (powerKw / this.speed) * 100 : null;

    const data: VehicleData = {
      timestamp: Date.now(),
      soc: round(this.soc, 1),
      speedKmh: round(this.speed, 0),
      odometerKm: round(this.odometer, 1),
      powerKw: round(powerKw, 1),
      consumptionKwh100: consumption !== null ? round(consumption, 1) : null,
      voltage: round(voltage, 1),
      current: round(current, 1),
      batteryTempC: round(this.batteryTemp, 1),
      motorTempC: round(this.motorTemp, 1),
      rangeKm: round((this.soc / 100) * packKwh * AION_UT_DRIVER.nominalKmPerKwh, 0),
      chargingState: 'idle',
      chargePowerKw: null,
      driveMode: 'normal',
      gear: this.speed > 0.5 ? 'D' : 'P',
      soh: 98.6,
    };

    this.emitData(data);
    // Sinal BLE oscila levemente
    this.setStatus({ signalQuality: clamp(88 + noise(6), 40, 100) });
  }

  private advancePhase() {
    this.phaseTicks++;
    const done = (n: number) => this.phaseTicks > n;
    switch (this.phase) {
      case 'stopped':
        if (done(10 + rand(14))) this.next('accelerating', 45 + rand(45));
        break;
      case 'accelerating':
        if (this.speed >= this.targetSpeed - 2) this.next('cruising', this.targetSpeed);
        break;
      case 'cruising':
        if (done(24 + rand(60))) this.next('braking', rand(1) > 0.6 ? 0 : 20 + rand(20));
        break;
      case 'braking':
        if (this.speed <= this.targetSpeed + 1) {
          this.next(this.targetSpeed < 2 ? 'stopped' : 'cruising', this.targetSpeed);
        }
        break;
    }
  }

  private next(phase: Phase, targetSpeed: number) {
    this.phase = phase;
    this.targetSpeed = targetSpeed;
    this.phaseTicks = 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noise = (amp: number) => (Math.random() - 0.5) * 2 * amp;
const rand = (n: number) => Math.random() * n;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
