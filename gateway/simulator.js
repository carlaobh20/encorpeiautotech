/**
 * Simulador do Aion UT no Gateway.
 * Mesmo ciclo de condução do simulador do PWA. Serve para validar o
 * pipeline completo (Gateway → Supabase Realtime → PWA) sem carro
 * e sem Bluetooth.
 */

const PACK_KWH = 60;
const KM_PER_KWH = 6.2;

export function createSimulator() {
  let phase = 'stopped';
  let phaseTicks = 0;
  let speed = 0;
  let targetSpeed = 0;
  let soc = 78.4;
  let odometer = 12408;
  let batteryTemp = 28;
  let motorTemp = 34;

  const noise = (amp) => (Math.random() - 0.5) * 2 * amp;
  const rand = (n) => Math.random() * n;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  function advancePhase() {
    phaseTicks++;
    const done = (n) => phaseTicks > n;
    const next = (p, t) => { phase = p; targetSpeed = t; phaseTicks = 0; };
    switch (phase) {
      case 'stopped':
        if (done(10 + rand(14))) next('accelerating', 45 + rand(45));
        break;
      case 'accelerating':
        if (speed >= targetSpeed - 2) next('cruising', targetSpeed);
        break;
      case 'cruising':
        if (done(24 + rand(60))) next('braking', rand(1) > 0.6 ? 0 : 20 + rand(20));
        break;
      case 'braking':
        if (speed <= targetSpeed + 1) next(targetSpeed < 2 ? 'stopped' : 'cruising', targetSpeed);
        break;
    }
  }

  /** Gera a próxima leitura (chamar a cada tickMs). */
  return function tick(tickMs) {
    advancePhase();

    const accel = phase === 'braking' ? 1.4 : 0.9;
    if (speed < targetSpeed) speed = Math.min(targetSpeed, speed + accel * 2.2);
    else if (speed > targetSpeed) speed = Math.max(targetSpeed, speed - accel * 3.0);

    let powerKw;
    if (phase === 'accelerating') powerKw = 18 + speed * 0.45 + noise(4);
    else if (phase === 'cruising') powerKw = 4 + speed * 0.16 + noise(1.5);
    else if (phase === 'braking') powerKw = -(6 + speed * 0.22) + noise(2);
    else powerKw = 0.6 + noise(0.2);

    const hours = tickMs / 3_600_000;
    soc = clamp(soc - (powerKw * hours * 100) / PACK_KWH, 0, 100);
    odometer += speed * hours;
    batteryTemp += Math.abs(powerKw) > 25 ? 0.01 : -0.005;
    motorTemp += Math.abs(powerKw) > 25 ? 0.03 : -0.015;

    const voltage = 340 + (soc / 100) * 60 + noise(0.5);

    return {
      timestamp: Date.now(),
      soc: round(soc, 1),
      speedKmh: round(speed, 0),
      odometerKm: round(odometer, 1),
      powerKw: round(powerKw, 1),
      consumptionKwh100: speed > 3 ? round((powerKw / speed) * 100, 1) : null,
      voltage: round(voltage, 1),
      current: round((powerKw * 1000) / voltage, 1),
      batteryTempC: round(batteryTemp, 1),
      motorTempC: round(motorTemp, 1),
      rangeKm: round((soc / 100) * PACK_KWH * KM_PER_KWH, 0),
      chargingState: 'idle',
      chargePowerKw: null,
      driveMode: 'normal',
      gear: speed > 0.5 ? 'D' : 'P',
      soh: 98.6,
    };
  };
}
