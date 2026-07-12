import { useEffect, useState } from 'react';
import { useVehicleStore } from './stores/vehicleStore';
import { CockpitHome } from './components/cockpit/CockpitHome';
import { TripSummary } from './components/trip/TripSummary';
import { PowerGauge } from './components/dashboard/PowerGauge';
import { TripMap } from './components/dashboard/TripMap';
import { HealthCard } from './components/dashboard/HealthCard';
import { BatteryCard, CellHealthCard, ConnectionBadge, StatGrid, TripBar, TripHistory } from './components/dashboard/Cards';

type View = 'cockpit' | 'details';

export default function App() {
  const connect = useVehicleStore((s) => s.connect);
  const summaryTrip = useVehicleStore((s) => s.summaryTrip);
  const closeSummary = useVehicleStore((s) => s.closeSummary);
  const [view, setView] = useState<View>('cockpit');

  // Conecta automaticamente ao abrir (fonte: Vehicle Gateway via Supabase Realtime)
  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <>
      {view === 'cockpit' && <CockpitHome onOpenDetails={() => setView('details')} />}

      {view === 'details' && (
        <main className="app">
          <header className="app-header">
            <button className="back-btn" onClick={() => setView('cockpit')} aria-label="Voltar ao cockpit">
              ← Cockpit
            </button>
            <ConnectionBadge />
          </header>

          <HealthCard />
          <PowerGauge />
          <BatteryCard />
          <CellHealthCard />
          <TripBar />
          <TripMap />
          <StatGrid />
          <TripHistory />

          <footer className="app-footer">
            Telemetria via Vehicle Gateway · GAC Aion UT + Vgate iCar Pro · ?source=mock para simulação
          </footer>
        </main>
      )}

      {summaryTrip && <TripSummary trip={summaryTrip} onClose={closeSummary} />}
    </>
  );
}
