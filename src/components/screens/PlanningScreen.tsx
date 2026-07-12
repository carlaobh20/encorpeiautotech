import { useVehicleStore } from '../../stores/vehicleStore';
import { useAppStore } from '../../stores/appStore';
import { useCopilot } from '../../hooks/useCopilot';
import { formatDuration } from '../../modules/navigation/geo';
import { RESERVE_SOC_PCT } from '../../config/assumptions';

/**
 * ESTADO 2 — Destino escolhido. O card de decisao:
 * distancia, tempo, chegada, bateria agora/na chegada, consumo previsto
 * e UMA conclusao: precisa ou nao carregar. Botao grande: INICIAR VIAGEM.
 */

export function PlanningScreen() {
  const destination = useAppStore((s) => s.destination);
  const plan = useAppStore((s) => s.plan);
  const planning = useAppStore((s) => s.planning);
  const planError = useAppStore((s) => s.planError);
  const cancelPlanning = useAppStore((s) => s.cancelPlanning);
  const startNavigation = useAppStore((s) => s.startNavigation);
  const soc = useVehicleStore((s) => s.data.soc);
  const { horizon } = useCopilot();

  const arrivalTime = plan ? new Date(Date.now() + plan.durationMin * 60000) : null;
  const socArrival = horizon?.socAtArrivalPct ?? null;
  const needsCharge = socArrival !== null && socArrival < RESERVE_SOC_PCT;
  const tight = socArrival !== null && !needsCharge && socArrival < RESERVE_SOC_PCT + 8;

  return (
    <div className="plan-sheet">
      <div className="plan-head">
        <div className="plan-route">
          <span className="plan-from">Sua posição</span>
          <span className="plan-arrow">↓</span>
          <span className="plan-to">{destination?.name.split(',')[0] ?? '—'}</span>
        </div>
        <button className="summary-close" onClick={cancelPlanning} aria-label="Cancelar">✕</button>
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
          <div className="plan-grid">
            <div className="sum-metric">
              <div className="sum-metric-value">{plan.distanceKm.toFixed(0)}<span className="sum-metric-unit"> km</span></div>
              <div className="sum-metric-label">Distância</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{formatDuration(plan.durationMin)}</div>
              <div className="sum-metric-label">Tempo</div>
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
              <div className="sum-metric-value" style={{ color: needsCharge ? 'var(--critical)' : tight ? 'var(--warn)' : 'var(--good)' }}>
                {socArrival !== null ? socArrival : '—'}<span className="sum-metric-unit">%</span>
              </div>
              <div className="sum-metric-label">Bateria prevista</div>
            </div>
            <div className="sum-metric">
              <div className="sum-metric-value">{horizon ? (horizon.avgWhPerKm / 10).toFixed(1).replace('.', ',') : '—'}</div>
              <div className="sum-metric-label">kWh/100km prev.</div>
            </div>
          </div>

          <div className={'plan-verdict ' + (needsCharge ? 'tone-critical' : tight ? 'tone-warn' : 'tone-good')}>
            <span className="ai-dot" />
            {needsCharge
              ? 'Será necessário recarregar no caminho.'
              : tight
                ? 'Você chega, mas com margem apertada. Dirija com calma.'
                : 'Não será necessário recarregar.'}
          </div>

          <button className="btn btn-primary btn-start" onClick={startNavigation}>INICIAR VIAGEM</button>
        </>
      )}
    </div>
  );
}
