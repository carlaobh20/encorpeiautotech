import { useEffect, useState } from 'react';
import { useVehicleStore } from './stores/vehicleStore';
import { useLocationStore } from './stores/locationStore';
import { useAppStore } from './stores/appStore';
import { LiveMap } from './components/map/LiveMap';
import { SearchScreen } from './components/screens/SearchScreen';
import { PlanningScreen } from './components/screens/PlanningScreen';
import { NavigationScreen } from './components/screens/NavigationScreen';
import { SummaryScreen } from './components/screens/SummaryScreen';
import { PowerGauge } from './components/dashboard/PowerGauge';
import { TripMap } from './components/dashboard/TripMap';
import { HealthCard } from './components/dashboard/HealthCard';
import { BatteryCard, CellHealthCard, ConnectionBadge, StatGrid, TripHistory } from './components/dashboard/Cards';

/**
 * UMA experiencia. A tela muda por contexto, nao por menu:
 *   search → planning → navigation → summary
 * O LiveMap e o palco permanente; as telas sao camadas sobre ele.
 * O painel completo (sensores) existe, mas e uma segunda tela opcional.
 */

export default function App() {
  const connect = useVehicleStore((s) => s.connect);
  const startWatch = useLocationStore((s) => s.startWatch);
  const mode = useAppStore((s) => s.mode);
  const [details, setDetails] = useState(false);

  useEffect(() => { connect(); startWatch(); }, [connect, startWatch]);

  return (
    <>
      <div className="stage">
        <LiveMap />
        {mode === 'search' && <SearchScreen onOpenDetails={() => setDetails(true)} />}
        {mode === 'planning' && <PlanningScreen />}
        {mode === 'navigation' && <NavigationScreen onOpenDetails={() => setDetails(true)} />}
        {mode === 'summary' && <SummaryScreen />}
      </div>

      {details && (
        <main className="app details-overlay">
          <header className="app-header">
            <button className="back-btn" onClick={() => setDetails(false)}>← Voltar</button>
            <ConnectionBadge />
          </header>
          <HealthCard />
          <PowerGauge />
          <BatteryCard />
          <CellHealthCard />
          <TripMap />
          <StatGrid />
          <TripHistory />
          <footer className="app-footer">
            Telemetria via Vehicle Gateway · GAC Aion UT + Vgate iCar Pro · ?source=mock para demo
          </footer>
        </main>
      )}
    </>
  );
}
