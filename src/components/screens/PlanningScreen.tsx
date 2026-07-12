import { useVehicleStore } from '../../stores/vehicleStore';
import { useAppStore } from '../../stores/appStore';
import { useCopilot } from '../../hooks/useCopilot';
import { formatDuration } from '../../modules/navigation/geo';
import { RESERVE_SOC_PCT } from '../../config/assumptions';
import { ConfidenceBadge } from '../cockpit/ConfidenceBadge';
import { SocSlider } from '../cockpit/SocSlider';

/**
 * ESTADO 2 — Destino escolhido. O card de decisao:
 * metricas, TIMELINE ENERGETICA (agora → parada ⚡ → destino) e UMA
 * conclusao clara. Botao grande: INICIAR VIAGEM.
 */

export function PlanningScreen() {
  const destination = useAppStore((s) => s.destination);
  const plan = useAppStore((s) => s.plan);
  const planning = useAppStore((s) => s.planning);
  const planError = useAppStore((s) => s.planError);
  const chargingStop = useAppStore((s) => s.chargingStop);
  const cancelPlanning = useAppStore((s) => s.cancelPlanning);
  const startNavigation = useAppStore((s) => s.startNavigation);
  const soc = useVehicleStore((s) => s.data.soc);
  const { horizon, confidence } = useCopilot();

  const chargeMin = chargingStop?.chargeMin ?? 0;
  const arrivalTime = plan ? new Date(Date.now() + (plan.durationMin + chargeMin) * 60000) : null;
  const socArrival = chargingStop ? chargingStop.socAtArrivalPct : horizon?.socAtArrivalPct ?? null;
  const needsCharge = chargingStop !== null || (socArrival !== null && socArrival < RESERVE_SOC_PCT);
  const tight = socArrival !== null && !needsCharge && socArrival < RESERVE_SOC_PCT + 8;

  return (
    <div className="plan-sheet">
      <div className="plan-head">
        <div className="plan-route">
          <span className="plan-from">Sua posição</span>
          <span className="plan-arrow">↓</span>
          <span className="plan-to">{destination?.name.split(',')[0] ?? '—'}</span>
        </div>
        <div className="plan-head-right">
          <ConfidenceBadge report={confidence} compact />
          <button className="summary-close" onClick={cancelPlanning} aria-label="Cancelar">✕</button>
        </div>
      </div>

      {planning && <div className="plan-loading">Calculando a melhor rota…</div>}
      {planError && (
        <div className="plan-error">
          {planError}
          <button className="btn btn-ghost" onClick={cancelPlanning}>Voltar</button>
        </div>
      )}

      {plan && !planning && (
        <>
          <SocSlider />

          <div className="plan-grid">
            <div className="sum-metric">
              <div className="sum-metric-value">{plan.distanceKm.toFixed(0)}<span className="sum-metric-unit"> km</span></div>
              <div className="sum-metric-label">Distância</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{formatDuration(plan.durationMin + chargeMin)}</div>
              <div className="sum-metric-label">{chargeMin > 0 ? 'Tempo c/ recarga' : 'Tempo'}</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{arrivalTime?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
              <div className="sum-metric-label">Chegada</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{soc !== null ? soc.toFixed(0) : '—'}<span className="sum-metric-unit">%</span></div>
              <div className="sum-metric-label">Bateria atual</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value" style={{ color: needsCharge ? 'var(--warn)' : tight ? 'var(--warn)' : 'var(--good)' }}>
                {socArrival !== null ? socArrival : '—'}<span className="sum-metric-unit">%</span>
              </div>
              <div className="sum-metric-label">Bateria prevista</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{horizon ? (horizon.avgWhPerKm / 10).toFixed(1).replace('.', ',') : '—'}</div>
              <div className="sum-metric-label">kWh/100km prev.</div>
            </div>
          </div>

          {/* TIMELINE ENERGETICA — a viagem como linha de energia */}
          {soc !== null && (
            <div className="plan-timeline">
              <div className="tl-node">
                <span className="tl-soc">{soc.toFixed(0)}%</span>
                <span className="tl-label">agora</span>
              </div>
              <div className="tl-line" />
              {chargingStop && (
                <>
                  <div className="tl-node tl-stop">
                    <span className="tl-soc">⚡ {chargingStop.socAtStopPct}%</span>
                    <span className="tl-label">
                      {chargingStop.charger ? chargingStop.charger.name.split(/[,-]/)[0].trim() : 'carregador · km ' + chargingStop.km}
                    </span>
                    <span className="tl-sub">carregar até {chargingStop.chargeToPct}% · ~{chargingStop.chargeMin} min</span>
                  </div>
                  <div className="tl-line" />
                </>
              )}
              <div className="tl-node">
                <span className="tl-soc" style={{ color: needsCharge || tight ? 'var(--warn)' : 'var(--good)' }}>
                  {socArrival !== null ? socArrival + '%' : '—'}
                </span>
                <span className="tl-label">destino</span>
              </div>
            </div>
          )}

          <div className={'plan-verdict ' + (needsCharge ? 'tone-warn' : tight ? 'tone-warn' : 'tone-good')}>
            <span className="ai-dot" />
            {chargingStop
              ? '1 parada de recarga · ' + (chargingStop.charger ? chargingStop.charger.name.split(/[,-]/)[0].trim() : 'próxima ao km ' + chargingStop.km) + ' · ~' + chargingStop.chargeMin + ' min'
              : needsCharge
                ? 'Será necessário recarregar no caminho.'
                : tight
                  ? 'Você chega, mas com margem apertada. Dirija com calma.'
                  : 'Não será necessário recarregar.'}
          </div>

          <button className="btn btn-primary btn-start" onClick={startNavigation} disabled={soc === null}>
            {soc === null ? 'INFORME A BATERIA ACIMA' : 'INICIAR VIAGEM'}
          </button>
        </>
      )}
    </div>
  );
}

