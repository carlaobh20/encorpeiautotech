import { useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useLocationStore } from '../../stores/locationStore';
import { useAppStore } from '../../stores/appStore';
import { useCopilot, useNavigationLoop } from '../../hooks/useCopilot';
import { maneuverText } from '../../modules/navigation/NavigationEngine';
import { formatDuration } from '../../modules/navigation/geo';
import { BottomSheet, type SheetState } from '../cockpit/BottomSheet';
import { sampleBuffer, sparkPath } from '../../modules/telemetry/SampleBuffer';

/**
 * ESTADO 3 — Modo Navegacao. O mapa e o palco (LiveMap por tras);
 * aqui vivem: banner de instrucao, cartoes da IA e o BottomSheet premium.
 */

function Spark({ series, color }: { series: number[]; color: string }) {
  return (
    <svg className="spark" viewBox="0 0 120 34" preserveAspectRatio="none">
      <path d={sparkPath(series, 120, 30)} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function NavigationScreen({ onOpenDetails }: { onOpenDetails: () => void }) {
  useNavigationLoop();
  const [sheet, setSheet] = useState<SheetState>('peek');
  const data = useVehicleStore((s) => s.data);
  const trip = useVehicleStore((s) => s.currentTrip);
  const progress = useAppStore((s) => s.progress);
  const cards = useAppStore((s) => s.cards);
  const endNavigation = useAppStore((s) => s.endNavigation);
  const { horizon, efficiencyKwh100 } = useCopilot();
  const isMock = useAppStore((s) => s.isMock);
  const gpsSpeed = useLocationStore((s) => s.position?.speedKmh ?? null);
  const speedShown = isMock ? (gpsSpeed ?? data.speedKmh) : (data.speedKmh ?? gpsSpeed);

  const man = progress ? maneuverText(progress) : { line1: 'Iniciando…', line2: '', arrow: '↑' };
  const eta = progress ? new Date(Date.now() + progress.remainingMin * 60000) : null;
  const socArr = horizon?.socAtArrivalPct ?? null;

  return (
    <div className="nav-screen">
      {/* Instrucao — so o que importa agora */}
      <div className="nav-banner">
        <span className="nav-arrow">{man.arrow}</span>
        <div className="nav-banner-text">
          <span className="nav-banner-l1">{man.line1}</span>
          {man.line2 && <span className="nav-banner-l2">{man.line2}</span>}
        </div>
        <div className="nav-banner-right">
          <span>{progress ? formatDuration(progress.remainingMin) : '—'}</span>
          <span className="nav-banner-dist">{progress ? progress.remainingKm.toFixed(0) + ' km' : ''}</span>
        </div>
      </div>

      {/* Cartoes da IA — aparecem, falam, desaparecem */}
      <div className="ai-cards">
        {cards.map((c) => (
          <div key={c.id} className={'ai-card tone-' + c.tone}>
            <span className="ai-dot" />
            <span>{c.text}</span>
          </div>
        ))}
      </div>

      <BottomSheet state={sheet} onStateChange={setSheet} peekHeight={132}>
        {/* Compacto: chegada · bateria na chegada · tempo · velocidade */}
        <div className="key-metrics">
          <div className="km">
            <div className="km-value">{eta ? eta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
            <div className="km-label">Chegada</div>
          </div>
          <div className="km">
            <div className="km-value" style={socArr !== null && socArr < 15 ? { color: 'var(--warn)' } : undefined}>
              {socArr !== null ? socArr : '—'}<span className="km-unit">%</span>
            </div>
            <div className="km-label">Na chegada</div>
          </div>
          <div className="km">
            <div className="km-value">{progress ? formatDuration(progress.remainingMin) : '—'}</div>
            <div className="km-label">Tempo</div>
          </div>
          <div className="km">
            <div className="km-value">{speedShown !== null ? speedShown.toFixed(0) : '—'}</div>
            <div className="km-label">km/h</div>
          </div>
        </div>

        {sheet !== 'peek' && (
          <div className="sheet-section">
            <div className="key-metrics">
              <div className="km">
                <div className="km-value">{efficiencyKwh100 !== null ? efficiencyKwh100.toFixed(1).replace('.', ',') : '—'}</div>
                <div className="km-label">kWh/100km</div>
              </div>
              <div className="km">
                <div className={'km-value ' + ((data.powerKw ?? 0) < 0 ? 'is-regen-text' : '')}>
                  {data.powerKw !== null ? Math.abs(data.powerKw).toFixed(0) : '—'}<span className="km-unit"> kW</span>
                </div>
                <div className="km-label">{(data.powerKw ?? 0) < 0 ? 'Regenerando' : 'Potência'}</div>
              </div>
              <div className="km">
                <div className="km-value">{data.soc !== null ? data.soc.toFixed(0) : '—'}<span className="km-unit">%</span></div>
                <div className="km-label">Bateria</div>
              </div>
              <div className="km">
                <div className="km-value">{data.batteryTempC !== null ? data.batteryTempC.toFixed(0) + '°' : '—'}</div>
                <div className="km-label">Temp. pack</div>
              </div>
            </div>

            {/* Energy Horizon em linha */}
            {horizon && (
              <div className="horizon-strip">
                {horizon.milestones.map((m, i) => (
                  <div key={i} className={'horizon-step' + (m.isArrival ? ' horizon-arrival' : '')}>
                    <span className="horizon-soc">{m.socPct}%</span>
                    <span className="horizon-km">{m.isArrival ? 'chegada' : m.km.toFixed(0) + ' km'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sheet === 'full' && (
          <div className="sheet-section">
            <div className="charts-row">
              <div className="chart-box">
                <div className="chart-label">Consumo</div>
                <Spark series={sampleBuffer.series('consumptionKwh100')} color="var(--amber)" />
              </div>
              <div className="chart-box">
                <div className="chart-label">Bateria</div>
                <Spark series={sampleBuffer.series('soc')} color="var(--teal)" />
              </div>
              <div className="chart-box">
                <div className="chart-label">Potência</div>
                <Spark series={sampleBuffer.series('powerKw')} color="var(--info)" />
              </div>
            </div>
            <div className="trip-mini">
              {trip ? trip.distanceKm.toFixed(1) + ' km · ' + trip.energyUsedKwh.toFixed(1) + ' kWh · regen ' + trip.energyRegenKwh.toFixed(1) + ' kWh' : ''}
            </div>
            <button className="btn btn-ghost" onClick={onOpenDetails}>Painel completo do veículo →</button>
          </div>
        )}

        <button className="btn btn-finish nav-end" onClick={endNavigation}>Encerrar viagem</button>
      </BottomSheet>
    </div>
  );
}
