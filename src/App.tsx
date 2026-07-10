import { useEffect } from 'react';
import { useVehicleStore } from './stores/vehicleStore';
import { PowerGauge } from './components/dashboard/PowerGauge';
import { BatteryCard, ConnectionBadge, StatGrid, TripBar, TripHistory } from './components/dashboard/Cards';

export default function App() {
  const connect = useVehicleStore((s) => s.connect);

    // Conecta automaticamente ao abrir (fonte: Vehicle Gateway via Supabase Realtime)
  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">ENCORPEI</span>
          <span className="brand-sub">AUTO</span>
        </div>
        <ConnectionBadge />
      </header>

      <PowerGauge />
      <BatteryCard />
      <TripBar />
      <StatGrid />
      <TripHistory />

      <footer className="app-footer">
                Telemetria via Vehicle Gateway · GAC Aion UT + Vgate iCar Pro · ?source=mock para simulação
      </footer>
    </main>
  );
}
