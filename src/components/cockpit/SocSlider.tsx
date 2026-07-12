import { useVehicleStore } from '../../stores/vehicleStore';
import { useAppStore } from '../../stores/appStore';

/**
 * Sem Vgate, nunca perguntamos "conecte o carro": o motorista informa a
 * bateria UMA vez e TODA a previsao (rota, timeline, parada) recalcula
 * na hora. Quando a telemetria real existir, este controle desaparece.
 */

export function SocSlider() {
  const hasTelemetry = useVehicleStore((s) => s.hasTelemetrySoc);
  const soc = useVehicleStore((s) => s.data.soc);
  const manualSoc = useVehicleStore((s) => s.manualSoc);
  const setManualSoc = useVehicleStore((s) => s.setManualSoc);
  const refreshEnergyPlan = useAppStore((s) => s.refreshEnergyPlan);

  if (hasTelemetry) return null; // telemetria real no comando — slider some

  const v = Math.round(soc ?? manualSoc ?? 80);
  const unset = soc === null && manualSoc === null;

  return (
    <div className={'soc-adjust' + (unset ? ' soc-adjust-unset' : '')}>
      <div className="soc-adjust-head">
        <span>{unset ? 'Qual o nível da bateria agora?' : 'Bateria agora (manual)'}</span>
        <span className="soc-adjust-value">{v}%</span>
      </div>
      <input
        className="soc-range"
        type="range" min={5} max={100} step={1} value={v}
        onChange={(e) => setManualSoc(Number(e.target.value))}
        onPointerUp={() => { void refreshEnergyPlan(); }}
        aria-label="Nível da bateria"
      />
      <div className="soc-adjust-hint">Sem leitura automática do carro — ajuste e toda a previsão recalcula.</div>
    </div>
  );
}
