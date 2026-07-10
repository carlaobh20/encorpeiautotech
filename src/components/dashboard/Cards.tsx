import { useVehicleStore } from '../../stores/vehicleStore';

export function BatteryCard() {
  const soc = useVehicleStore((s) => s.data.soc);
  const range = useVehicleStore((s) => s.data.rangeKm);
  const temp = useVehicleStore((s) => s.data.batteryTempC);
  const soh = useVehicleStore((s) => s.data.soh);
  const pct = soc ?? 0;
  const low = pct < 20;

  return (
    <section className="card battery-card" aria-label="Bateria">
      <header className="card-head">
        <span className="card-label">Bateria</span>
        <span className="card-aux">{soh !== null ? `SOH ${soh}%` : ''}</span>
      </header>
      <div className="battery-row">
        <div className="battery-soc">
          {soc !== null ? soc.toFixed(0) : '—'}
          <span className="battery-pct">%</span>
        </div>
        <div className="battery-meta">
          <div className="battery-range">{range !== null ? `${range} km` : '—'}</div>
          <div className="battery-sub">autonomia estimada</div>
          <div className="battery-sub">{temp !== null ? `${temp.toFixed(0)} °C pack` : ''}</div>
        </div>
      </div>
      <div className="battery-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`battery-bar-fill ${low ? 'is-low' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}

export function ConnectionBadge() {
  const status = useVehicleStore((s) => s.status);
  const connect = useVehicleStore((s) => s.connect);
  const disconnect = useVehicleStore((s) => s.disconnect);

  const labels: Record<string, string> = {
    disconnected: 'Desconectado',
    connecting: 'Conectando…',
    connected: 'Conectado',
    reconnecting: 'Reconectando…',
    error: 'Erro de conexão',
  };

  const isOn = status.state === 'connected';
  return (
    <button
      className={`conn-badge conn-${status.state}`}
      onClick={() => (isOn ? disconnect() : connect())}
    >
      <span className="conn-dot" />
      <span>
        {labels[status.state]}
        {isOn && status.deviceName ? ` · ${status.deviceName}` : ''}
        {isOn && status.signalQuality !== null ? ` · ${status.signalQuality.toFixed(0)}%` : ''}
      </span>
    </button>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
    </div>
  );
}

export function StatGrid() {
  const d = useVehicleStore((s) => s.data);
  const fmt = (v: number | null, dec = 1) => (v !== null ? v.toFixed(dec) : '—');
  return (
    <section className="card stat-grid" aria-label="Telemetria">
      <Stat label="Consumo" value={fmt(d.consumptionKwh100)} unit="kWh/100km" />
      <Stat label="Tensão" value={fmt(d.voltage, 0)} unit="V" />
      <Stat label="Corrente" value={fmt(d.current, 0)} unit="A" />
      <Stat label="Motor" value={fmt(d.motorTempC, 0)} unit="°C" />
      <Stat label="Odômetro" value={d.odometerKm !== null ? d.odometerKm.toFixed(0) : '—'} unit="km" />
      <Stat label="Modo" value={d.driveMode === 'unknown' ? '—' : d.driveMode} />
    </section>
  );
}

export function TripBar() {
  const tripState = useVehicleStore((s) => s.tripState);
  const trip = useVehicleStore((s) => s.currentTrip);
  const { startTrip, pauseTrip, resumeTrip, finishTrip } = useVehicleStore();

  if (tripState === 'idle') {
    return (
      <section className="card trip-bar">
        <div className="trip-idle-text">Nenhuma viagem em andamento</div>
        <button className="btn btn-primary" onClick={startTrip}>Iniciar viagem</button>
      </section>
    );
  }

  const mins = trip ? Math.floor(trip.durationMs / 60000) : 0;
  const secs = trip ? Math.floor((trip.durationMs % 60000) / 1000) : 0;

  return (
    <section className="card trip-bar trip-active" aria-label="Viagem atual">
      <div className="trip-metrics">
        <Stat label="Tempo" value={`${mins}:${String(secs).padStart(2, '0')}`} />
        <Stat label="Distância" value={trip ? trip.distanceKm.toFixed(1) : '0.0'} unit="km" />
        <Stat label="Gasto" value={trip ? trip.energyUsedKwh.toFixed(2) : '0.00'} unit="kWh" />
        <Stat label="Regen" value={trip ? trip.energyRegenKwh.toFixed(2) : '0.00'} unit="kWh" />
      </div>
      <div className="trip-actions">
        {tripState === 'running' ? (
          <button className="btn" onClick={pauseTrip}>Pausar</button>
        ) : (
          <button className="btn" onClick={resumeTrip}>Retomar</button>
        )}
        <button className="btn btn-finish" onClick={finishTrip}>Finalizar</button>
      </div>
    </section>
  );
}

export function TripHistory() {
  const history = useVehicleStore((s) => s.tripHistory);
  if (history.length === 0) return null;
  return (
    <section className="card" aria-label="Histórico de viagens">
      <header className="card-head">
        <span className="card-label">Últimas viagens</span>
        <span className="card-aux">{history.length}</span>
      </header>
      <ul className="trip-history">
        {history.slice(0, 5).map((t) => (
          <li key={t.id} className="trip-history-item">
            <span>{new Date(t.startedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
              {new Date(t.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>{t.distanceKm.toFixed(1)} km</span>
            <span>{t.energyUsedKwh.toFixed(1)} kWh</span>
            <span className="th-soc">
              {t.socStart !== null && t.socEnd !== null ? `${t.socStart.toFixed(0)}→${t.socEnd.toFixed(0)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
