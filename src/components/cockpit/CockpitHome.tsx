import { useEffect, useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useLocationStore } from '../../stores/locationStore';
import { useCopilot } from '../../hooks/useCopilot';
import { CockpitMap } from './CockpitMap';
import { BottomSheet, type SheetState } from './BottomSheet';
import { ConnectionBadge } from '../dashboard/Cards';
import { HealthChip } from '../dashboard/HealthCard';

/**
 * O Cockpit — a nova Home. Mapa e o palco (~70% da tela); o BottomSheet
 * mostra so o que importa: bateria, chegada, ETA, eficiencia e a linha da IA.
 * Sensores detalhados ficam no painel completo (uma tela abaixo).
 */

function fmtEta(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
}

export function CockpitHome({ onOpenDetails }: { onOpenDetails: () => void }) {
  const [sheet, setSheet] = useState<SheetState>('half');
  const data = useVehicleStore((s) => s.data);
  const tripState = useVehicleStore((s) => s.tripState);
  const currentTrip = useVehicleStore((s) => s.currentTrip);
  const { startTrip, finishTrip } = useVehicleStore();
  const destination = useLocationStore((s) => s.destination);
  const setDestination = useLocationStore((s) => s.setDestination);
  const startWatch = useLocationStore((s) => s.startWatch);
  const geoState = useLocationStore((s) => s.geoState);
  const copilot = useCopilot();

  useEffect(() => { startWatch(); }, [startWatch]);

  const p = copilot.prediction;
  const top = copilot.insights[0] ?? null;
  const second = copilot.insights[1] ?? null;
  const power = data.powerKw;

  return (
    <div className="cockpit">
      <CockpitMap />

      <header className="cockpit-header">
        <div className="brand">
          <span className="brand-name">ENCORPEI</span>
          <span className="brand-sub">AUTO</span>
        </div>
        <div className="cockpit-header-right">
          <HealthChip onClick={onOpenDetails} />
          <ConnectionBadge />
        </div>
      </header>

      <BottomSheet state={sheet} onStateChange={setSheet}>
        {/* Linha da IA — sempre visivel */}
        <div className={'ai-line tone-' + (top?.tone ?? 'info')}>
          <span className="ai-dot" />
          <span>{top ? top.text : destination ? 'Calculando…' : 'Toque no mapa para definir o destino.'}</span>
        </div>

        {/* Metricas essenciais — sempre visiveis */}
        <div className="key-metrics">
          <div className="km">
            <div className="km-value">{data.soc !== null ? data.soc.toFixed(0) : '—'}<span className="km-unit">%</span></div>
            <div className="km-label">Bateria</div>
          </div>
          <div className="km">
            <div className="km-value">{p ? p.socAtArrivalPct : '—'}<span className="km-unit">%</span></div>
            <div className="km-label">Na chegada</div>
          </div>
          <div className="km">
            <div className="km-value">{fmtEta(p?.etaMinutes ?? null)}</div>
            <div className="km-label">ETA</div>
          </div>
          <div className="km">
            <div className="km-value">{copilot.efficiencyKwh100 !== null ? copilot.efficiencyKwh100.toFixed(1) : '—'}</div>
            <div className="km-label">kWh/100km</div>
          </div>
        </div>

        {/* Estado half+: segundo insight, velocidade/potencia, destino, viagem */}
        {sheet !== 'peek' && (
          <div className="sheet-section">
            {second && (
              <div className={'ai-line ai-line-secondary tone-' + second.tone}>
                <span className="ai-dot" />
                <span>{second.text}</span>
              </div>
            )}

            <div className="drive-row">
              <div className="drive-speed">
                <span className="drive-speed-value">{data.speedKmh !== null ? data.speedKmh.toFixed(0) : '—'}</span>
                <span className="drive-speed-unit">km/h</span>
              </div>
              <div className={'drive-power ' + (power !== null && power < 0 ? 'is-regen' : '')}>
                {power !== null ? (power < 0 ? '↺ ' : '') + Math.abs(power).toFixed(0) + ' kW' : '—'}
              </div>
              <div className="drive-dist">
                {copilot.distanceRemainingKm !== null ? copilot.distanceRemainingKm.toFixed(0) + ' km restantes' : 'sem destino'}
              </div>
            </div>

            {destination && (
              <div className="dest-row">
                <span className="dest-name">→ {destination.name ?? 'Destino definido'}</span>
                <button className="dest-clear" onClick={() => setDestination(null)}>remover</button>
              </div>
            )}

            <div className="trip-controls">
              {tripState === 'idle' ? (
                <button className="btn btn-primary" onClick={startTrip}>Iniciar viagem</button>
              ) : (
                <>
                  <div className="trip-mini">
                    {currentTrip ? currentTrip.distanceKm.toFixed(1) + ' km · ' +
                      (currentTrip.energyUsedKwh - currentTrip.energyRegenKwh).toFixed(1) + ' kWh' : ''}
                  </div>
                  <button className="btn btn-finish" onClick={finishTrip}>Finalizar viagem</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Estado full: caminho para o painel completo */}
        {sheet === 'full' && (
          <div className="sheet-section">
            {geoState === 'denied' && (
              <div className="geo-warn">GPS negado — o mapa e a previsao de chegada precisam da sua localizacao.</div>
            )}
            <button className="btn btn-ghost" onClick={onOpenDetails}>Painel completo do veiculo →</button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
