import { useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import { useLocationStore } from '../../stores/locationStore';
import { useAppStore } from '../../stores/appStore';
import { useCopilot, useNavigationLoop } from '../../hooks/useCopilot';
import { maneuverText } from '../../modules/navigation/NavigationEngine';
import { formatDuration } from '../../modules/navigation/geo';
import { rangeRadiusKm } from '../../modules/intelligence/EnergyHorizon';
import { AION_UT_DRIVER } from '../../modules/vehicle/drivers/aion-ut';
import { RESERVE_SOC_PCT, USER_NAME } from '../../config/assumptions';

/**
* ESTADO 3 — Modo Navegacao. HUD minimalista sobre o mapa: o mapa e a
* prioridade absoluta, todo o resto e overlay flutuante (glass).
*
* Sem OBD conectado, o card de bateria manual aparece com +/- (sem
* slider, sem confirmar — cada toque recalcula a viagem na hora).
* Quando a telemetria real chegar, esse card some sozinho.
*/

export function NavigationScreen({ onOpenDetails: _onOpenDetails }: { onOpenDetails: () => void }) {
useNavigationLoop();
const [chargeDetailOpen, setChargeDetailOpen] = useState(false);
const data = useVehicleStore((s) => s.data);
const hasTelemetry = useVehicleStore((s) => s.hasTelemetrySoc);
const manualSoc = useVehicleStore((s) => s.manualSoc);
const setManualSoc = useVehicleStore((s) => s.setManualSoc);
const progress = useAppStore((s) => s.progress);
const chargingStop = useAppStore((s) => s.chargingStop);
const endNavigation = useAppStore((s) => s.endNavigation);
const refreshEnergyPlan = useAppStore((s) => s.refreshEnergyPlan);
const isMock = useAppStore((s) => s.isMock);
const setFollow = useLocationStore((s) => s.setFollow);
const gpsSpeed = useLocationStore((s) => s.position?.speedKmh ?? null);
const speedShown = isMock ? (gpsSpeed ?? data.speedKmh) : (data.speedKmh ?? gpsSpeed);
const { horizon, nominalWhPerKm } = useCopilot();

const man = progress ? maneuverText(progress) : { line1: 'Iniciando…', line2: '', arrow: '↑' };
const eta = progress ? new Date(Date.now() + progress.remainingMin * 60000) : null;
const socArrival = chargingStop ? chargingStop.socAtArrivalPct : horizon?.socAtArrivalPct ?? null;
const needsCharge = chargingStop !== null || (socArrival !== null && socArrival < RESERVE_SOC_PCT);

const whPerKm = horizon?.avgWhPerKm ?? nominalWhPerKm;
const rangeNowKm = data.soc !== null ? Math.round(rangeRadiusKm(data.soc, AION_UT_DRIVER.batteryCapacityKwh, whPerKm, RESERVE_SOC_PCT)) : null;
const rangeArrivalKm = socArrival !== null ? Math.round(rangeRadiusKm(socArrival, AION_UT_DRIVER.batteryCapacityKwh, whPerKm, RESERVE_SOC_PCT)) : null;

const manualDisplay = Math.round(data.soc ?? manualSoc ?? 80);
function stepSoc(delta: number) {
setManualSoc(manualDisplay + delta);
void refreshEnergyPlan();
}

const chargerLabel = chargingStop?.charger
? chargingStop.charger.name.split(/[,-]/)[0].trim()
: chargingStop
? 'carregador próximo ao km ' + chargingStop.km
: null;
const alertText = chargerLabel
? USER_NAME + ', no ritmo atual você não fecha essa rota. Vou passar por ' + chargerLabel + ' no caminho.'
: USER_NAME + ', você não chega com essa carga. Vou procurar um carregador na rota.';

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

{needsCharge && (
<div className="nav-alert">
<div className="nav-alert-row">
<span className="nav-alert-dot" />
<span className="nav-alert-text">{alertText}</span>
<button className="nav-alert-action" onClick={() => setChargeDetailOpen((v) => !v)}>Ver opção</button>
</div>
{chargeDetailOpen && (
<div className="nav-alert-detail">
{chargingStop
? 'Parar aos ' + chargingStop.km + ' km · chegar com ' + chargingStop.socAtStopPct + '% · carregar até ' + chargingStop.chargeToPct + '% (~' + chargingStop.chargeMin + ' min)'
: 'Calculando o melhor ponto de parada…'}
</div>
)}
</div>
)}

{/* Botoes flutuantes do mapa */}
<div className="nav-fabs">
<button className="nav-fab nav-fab-inert" aria-label="Bússola (em breve)">🧭</button>
<button className="nav-fab nav-fab-inert" aria-label="Camadas (em breve)">▤</button>
<button className="nav-fab" onClick={() => setFollow(true)} aria-label="Centralizar no carro">⌖</button>
</div>

<div className="nav-bottom-stack">
{!hasTelemetry && (
<div className="nav-battery-card">
<div className="nav-battery-label">BATERIA ATUAL</div>
<div className="nav-battery-row">
<span className="nav-battery-value">{manualDisplay}%</span>
<div className="nav-battery-stepper">
<button className="nav-battery-btn" onClick={() => stepSoc(1)} aria-label="Aumentar 1%">+</button>
<button className="nav-battery-btn" onClick={() => stepSoc(-1)} aria-label="Diminuir 1%">−</button>
</div>
</div>
<div className="nav-battery-hint">Ajuste manual em tempo real</div>
</div>
)}

<div className="nav-bottom-panel">
<div className="nav-split">
<div className="nav-split-col">
<span className="nav-split-icon">🔋</span>
<span className="nav-split-label">BATERIA ATUAL</span>
<span className="nav-split-value">{data.soc !== null ? Math.round(data.soc) : '—'}%</span>
<span className="nav-split-sub">Autonomia estimada<br />{rangeNowKm !== null ? rangeNowKm + ' km' : '—'}</span>
</div>
<div className="nav-split-divider" />
<div className="nav-split-col">
<span className="nav-split-icon">🏁</span>
<span className="nav-split-label">BATERIA NO DESTINO</span>
<span className="nav-split-value" style={socArrival !== null && socArrival < RESERVE_SOC_PCT ? { color: 'var(--warn)' } : undefined}>
{socArrival !== null ? socArrival : '—'}%
</span>
<span className="nav-split-sub">Autonomia prevista<br />{rangeArrivalKm !== null ? rangeArrivalKm + ' km' : '—'}</span>
</div>
</div>

<div className="nav-stats-row">
<div className="nav-stat">
<span className="nav-stat-value">{eta ? eta.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
<span className="nav-stat-label">Chegada</span>
</div>
<div className="nav-stat">
<span className="nav-stat-value">{progress ? formatDuration(progress.remainingMin) : '—'}</span>
<span className="nav-stat-label">Tempo</span>
</div>
<div className="nav-stat">
<span className="nav-stat-value">{progress ? progress.remainingKm.toFixed(0) : '—'}<span className="nav-stat-unit"> km</span></span>
<span className="nav-stat-label">Distância</span>
</div>
<div className="nav-stat">
<span className="nav-stat-value">{speedShown !== null ? speedShown.toFixed(0) : '—'}</span>
<span className="nav-stat-label">KM/H</span>
</div>
</div>

<button className="btn nav-end-btn" onClick={endNavigation}>Encerrar viagem</button>
</div>
</div>
</div>
);
}
