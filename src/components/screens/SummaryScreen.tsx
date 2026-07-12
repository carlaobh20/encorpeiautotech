import { useVehicleStore } from '../../stores/vehicleStore';
import { useAppStore } from '../../stores/appStore';
import { tripRecommendations } from '../../modules/intelligence/CopilotAI';
import { AION_UT_DRIVER } from '../../modules/vehicle/drivers/aion-ut';
import { ENERGY_TARIFF_BRL_KWH, GAS_PRICE_BRL_L, GAS_KM_PER_L } from '../../config/assumptions';

/**
 * ESTADO 4 — Chegada. Resumo premium + tres recomendacoes da IA.
 */

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="sum-metric">
      <div className="sum-metric-value" style={accent ? { color: accent } : undefined}>
        {value}{unit && <span className="sum-metric-unit"> {unit}</span>}
      </div>
      <div className="sum-metric-label">{label}</div>
    </div>
  );
}

export function SummaryScreen() {
  const trip = useVehicleStore((s) => s.summaryTrip);
  const soc = useVehicleStore((s) => s.data.soc);
  const closeSummary = useAppStore((s) => s.closeSummary);

  if (!trip) {
    return (
      <div className="summary-overlay"><div className="summary-card">
        <div className="summary-title">Viagem encerrada</div>
        <button className="btn btn-primary summary-ok" onClick={closeSummary}>Nova viagem</button>
      </div></div>
    );
  }

  const nominalWhKm = 1000 / AION_UT_DRIVER.nominalKmPerKwh;
  const dist = Math.max(trip.distanceKm, trip.gpsDistanceKm);
  const netKwh = Math.max(0, trip.energyUsedKwh - trip.energyRegenKwh);
  const kwh100 = dist > 0.3 ? (netKwh / dist) * 100 : null;
  const whKm = kwh100 !== null ? kwh100 * 10 : nominalWhKm;

  // Economia vs carro a combustao equivalente (premissas em config/assumptions)
  const costEv = netKwh * ENERGY_TARIFF_BRL_KWH;
  const costGas = (dist / GAS_KM_PER_L) * GAS_PRICE_BRL_L;
  const saved = Math.max(0, costGas - costEv);

  // Nota de eficiencia 0-100 vs nominal
  const eff = Math.round(Math.max(0, Math.min(100, 100 - ((whKm / nominalWhKm) - 1) * 120)));

  const recs = tripRecommendations({
    distanceKm: dist,
    energyUsedKwh: trip.energyUsedKwh,
    energyRegenKwh: trip.energyRegenKwh,
    avgSpeedKmh: trip.avgSpeedKmh,
    maxSpeedKmh: trip.maxSpeedKmh,
    nominalWhPerKm: nominalWhKm,
  });

  const arrivalSoc = trip.socEnd ?? soc;

  return (
    <div className="summary-overlay" role="dialog" aria-label="Resumo da viagem">
      <div className="summary-card">
        <header className="summary-head">
          <div>
            <div className="summary-title">Viagem concluída</div>
            <div className="summary-date">
              {new Date(trip.startedAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </div>
          </div>
          <div className="summary-eff" title="Nota de eficiência">
            <span className="summary-eff-score">{eff}</span>
            <span className="summary-eff-max">/100</span>
          </div>
        </header>

        <div className="summary-hero">
          <Metric label="Você percorreu" value={dist.toFixed(0)} unit="km" />
          <Metric label="Chegou com" value={arrivalSoc !== null ? arrivalSoc.toFixed(0) : '—'} unit="%" />
          <Metric label="Consumo" value={kwh100 !== null ? kwh100.toFixed(1).replace('.', ',') : '—'} unit="kWh/100km" />
        </div>

        <div className="summary-grid">
          <Metric label="Economizou" value={'R$ ' + saved.toFixed(0)} accent="var(--good)" />
          <Metric label="Regenerou" value={trip.energyRegenKwh.toFixed(1).replace('.', ',')} unit="kWh" accent="var(--teal)" />
          <Metric label="Vel. média" value={trip.avgSpeedKmh.toFixed(0)} unit="km/h" />
        </div>

        <div className="summary-recs">
          <div className="summary-recs-title">Recomendações do copiloto</div>
          {recs.map((r, i) => (
            <div key={i} className="summary-rec">
              <span className="summary-rec-n">{i + 1}</span>
              <span>{r}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-primary summary-ok" onClick={closeSummary}>Concluir</button>
      </div>
    </div>
  );
}
