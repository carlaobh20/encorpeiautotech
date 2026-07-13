import { useEffect, useMemo, useRef } from 'react';
import { useVehicleStore } from '../stores/vehicleStore';
import { useLocationStore } from '../stores/locationStore';
import { useAppStore, copilotFeed } from '../stores/appStore';
import { useEnvironmentStore } from '../stores/environmentStore';
import { useAppSettingsStore } from '../stores/appSettingsStore';
import { AION_UT_DRIVER } from '../modules/vehicle/drivers/aion-ut';
import { haversineKm } from '../modules/trip/TripEngine';
import { predict, type Prediction, type PredictionInput } from '../modules/intelligence/PredictionEngine';
import { assessHealth, type HealthReport } from '../modules/intelligence/HealthEngine';
import { computeHorizon, type EnergyHorizon } from '../modules/intelligence/EnergyHorizon';
import { assessConfidence, type ConfidenceReport } from '../modules/intelligence/ConfidenceEngine';
import { computeProgress, fetchRoute } from '../modules/navigation/NavigationEngine';
import { RESERVE_SOC_PCT, ROAD_FACTOR } from '../config/assumptions';
import { sampleBuffer } from '../modules/telemetry/SampleBuffer';
import type { EnvironmentInput } from '../modules/intelligence/EnvironmentFactors';
import type { DrivingProfile } from '../stores/appSettingsStore';

/**
* Os engines encontram os dados vivos aqui — e em nenhum outro lugar.
* useCopilot: leitura derivada (previsao, horizon, saude, confianca).
* useNavigationLoop: o "tick" do modo navegacao (progresso, chegada, IA, reroute).
*/

/**
 * Perfil de conducao e carga extra (Menu Lateral) entram como DEFAULT do
 * ambiente — o ajuste manual do dia (EnvironmentAdjust, por viagem) sempre
 * tem prioridade se o motorista preencheu algo naquela tela.
 */
function withUsageDefaults(overrides: EnvironmentInput, drivingProfile: DrivingProfile, extraLoadKg: number): EnvironmentInput {
return {
...(drivingProfile !== 'normal' ? { drivingProfile } : {}),
...(extraLoadKg > 0 ? { extraWeightKg: extraLoadKg } : {}),
...overrides,
};
}

const NOMINAL_WH_KM = Math.round(1000 / AION_UT_DRIVER.nominalKmPerKwh);

export interface CopilotView {
prediction: Prediction | null;
horizon: EnergyHorizon | null;
health: HealthReport;
confidence: ConfidenceReport;
distanceRemainingKm: number | null;
consumptionWhPerKm: number;
efficiencyKwh100: number | null;
nominalWhPerKm: number;
}

export function useCopilot(): CopilotView {
const data = useVehicleStore((s) => s.data);
const currentTrip = useVehicleStore((s) => s.currentTrip);
const hasTelemetrySoc = useVehicleStore((s) => s.hasTelemetrySoc);
const manualSoc = useVehicleStore((s) => s.manualSoc);
const position = useLocationStore((s) => s.position);
const plan = useAppStore((s) => s.plan);
const progress = useAppStore((s) => s.progress);
const mode = useAppStore((s) => s.mode);
const environmentOverrides = useEnvironmentStore((s) => s.environment);
const drivingProfile = useAppSettingsStore((s) => s.drivingProfile);
const extraLoadKg = useAppSettingsStore((s) => s.extraLoadKg);
// Media movel exponencial do consumo instantaneo — uma unica leitura crua
// (freada, arrancada) nao pode mover sozinha a previsao de uma viagem de horas.
const consumptionEmaRef = useRef<number | null>(null);

return useMemo(() => {
const environment = withUsageDefaults(environmentOverrides, drivingProfile, extraLoadKg);
// consumo recente (Wh/km)
let consumption = NOMINAL_WH_KM;
let consumptionObserved = false;
if (currentTrip && currentTrip.distanceKm > 0.8) {
// Media cumulativa da propria viagem em curso — ja e estavel por natureza
// (cresce com a distancia, nao com o instante), mas realimenta a EMA para
// a leitura instantanea nao "puxar" a previsao pra longe assim que a viagem acabar.
const netKwh = Math.max(0.05, currentTrip.energyUsedKwh - currentTrip.energyRegenKwh);
consumption = (netKwh / currentTrip.distanceKm) * 1000;
consumptionObserved = true;
consumptionEmaRef.current = consumption;
} else if (data.consumptionKwh100 !== null && data.consumptionKwh100 > 0) {
// Leitura instantanea (PID cru) suavizada por EMA antes de alimentar
// EnergyHorizon/PredictionEngine — sem isso, uma frenagem ou arrancada
// isolada faz "bateria prevista na chegada" e "kWh/100km prev." saltarem
// 2-3x de uma leitura pra outra, mesmo com a rota identica.
const instant = Math.max(80, data.consumptionKwh100 * 10);
consumptionEmaRef.current =
consumptionEmaRef.current === null
? instant
: consumptionEmaRef.current + 0.08 * (instant - consumptionEmaRef.current);
consumption = consumptionEmaRef.current;
consumptionObserved = true;
}

// distancia restante: rota real > linha reta
let distanceRemainingKm: number | null = null;
if (plan && mode === 'navigation' && progress) distanceRemainingKm = progress.remainingKm;
else if (plan) distanceRemainingKm = plan.distanceKm;
else if (position && useAppStore.getState().destination) {
const d = useAppStore.getState().destination!;
distanceRemainingKm = haversineKm(position.lat, position.lng, d.lat, d.lng) * ROAD_FACTOR;
}

const speed = data.speedKmh ?? position?.speedKmh ?? 0;
let prediction: Prediction | null = null;
let horizon: EnergyHorizon | null = null;

if (data.soc !== null && plan) {
horizon = computeHorizon(plan, data.soc, consumption, Math.max(20, speed), AION_UT_DRIVER.batteryCapacityKwh, progress?.traveledKm ?? 0, 5, environment);
}
if (data.soc !== null && distanceRemainingKm !== null && distanceRemainingKm > 0.2) {
const input: PredictionInput = {
socPct: data.soc,
packUsableKwh: AION_UT_DRIVER.batteryCapacityKwh,
distanceRemainingKm,
recentConsumptionWhPerKm: horizon ? horizon.avgWhPerKm : consumption,
speedKmh: speed,
reserveSocPct: RESERVE_SOC_PCT,
environment,
};
prediction = predict(input);
}

// Modo Confianca — o quanto da pra confiar no que estamos prevendo
const climateConsidered = Object.keys(environment).length > 0;
const confidence = assessConfidence({
telemetryLive: hasTelemetrySoc,
socManual: !hasTelemetrySoc && manualSoc !== null,
socKnown: data.soc !== null,
gpsFresh: !!position && Date.now() - position.t < 12000 && (position.accuracyM === null || position.accuracyM < 80),
routeFresh: !!plan && (mode === 'navigation' ? progress !== null : Date.now() - plan.fetchedAt < 15 * 60000),
consumptionObserved,
marginPct: prediction?.marginPct ?? null,
climateConsidered,
});

return {
prediction,
horizon,
health: assessHealth(data),
confidence,
distanceRemainingKm,
consumptionWhPerKm: Math.round(consumption),
efficiencyKwh100: Math.round(consumption) / 10,
nominalWhPerKm: NOMINAL_WH_KM,
};
}, [data, currentTrip, hasTelemetrySoc, manualSoc, position, plan, progress, mode, environmentOverrides, drivingProfile, extraLoadKg]);
}

/** O tick do modo navegacao. Montar UMA vez (na NavigationScreen). */
export function useNavigationLoop() {
const mode = useAppStore((s) => s.mode);
const offRouteTicks = useRef(0);
const rerouting = useRef(false);
const hintIdx = useRef(0);

// progresso + chegada + reroute, a cada nova posicao
useEffect(() => {
if (mode !== 'navigation') return;
const unsub = useLocationStore.subscribe((s, prev) => {
const pos = s.position;
if (!pos || pos === prev.position) return;
const { plan } = useAppStore.getState();
if (!plan) return;
const speed = useVehicleStore.getState().data.speedKmh ?? pos.speedKmh ?? 0;
const p = computeProgress(plan, { lat: pos.lat, lng: pos.lng }, hintIdx.current, speed);
hintIdx.current = p.routeIdx;
useAppStore.getState().setProgress(p);

if (p.arrived) { useAppStore.getState().endNavigation(); return; }

// fora da rota por varios ticks → recalcular
if (p.offRouteKm > 0.09) offRouteTicks.current++;
else offRouteTicks.current = 0;
if (offRouteTicks.current >= 5 && !rerouting.current && !useAppStore.getState().isMock) {
rerouting.current = true;
offRouteTicks.current = 0;
fetchRoute({ lat: pos.lat, lng: pos.lng }, plan.to, plan.toName)
.then((np) => { hintIdx.current = 0; useAppStore.setState({ plan: np }); useAppStore.getState().refreshEnergyPlan(); })
.catch(() => { /* mantem plano atual */ })
.finally(() => { rerouting.current = false; });
}
});
return unsub;
}, [mode]);

// IA copiloto + amostras p/ graficos + expiracao dos cartoes + soc estimado
useEffect(() => {
if (mode !== 'navigation') return;
const timer = setInterval(() => {
const app = useAppStore.getState();
const veh = useVehicleStore.getState();
const settings = useAppSettingsStore.getState();
const environment = withUsageDefaults(useEnvironmentStore.getState().environment, settings.drivingProfile, settings.extraLoadKg);
let d = veh.data;

let consumption: number | null = d.consumptionKwh100 !== null ? d.consumptionKwh100 * 10 : null;
const trip = veh.currentTrip;
if (trip && trip.distanceKm > 0.8) {
consumption = ((Math.max(0.05, trip.energyUsedKwh - trip.energyRegenKwh)) / trip.distanceKm) * 1000;
}

// Sem Vgate: a bateria desce pelo MODELO a partir do valor informado.
// Honesto (o Modo Confianca deixa claro) e mantem toda a previsao viva.
if (!veh.hasTelemetrySoc && app.socAtNavStart !== null && app.progress) {
const usedKm = trip && trip.gpsDistanceKm > 0 ? Math.max(trip.gpsDistanceKm, app.progress.traveledKm) : app.progress.traveledKm;
const dropPct = (((consumption ?? NOMINAL_WH_KM) * usedKm) / 1000 / AION_UT_DRIVER.batteryCapacityKwh) * 100;
veh.setEstimatedSoc(app.socAtNavStart - dropPct);
d = useVehicleStore.getState().data;
}

sampleBuffer.push({
t: Date.now(), soc: d.soc, powerKw: d.powerKw,
consumptionKwh100: d.consumptionKwh100, batteryTempC: d.batteryTempC, speedKmh: d.speedKmh,
});

let socAtArrival: number | null = null;
if (app.plan && d.soc !== null) {
const h = computeHorizon(app.plan, d.soc, consumption ?? NOMINAL_WH_KM,
Math.max(20, d.speedKmh ?? 0), AION_UT_DRIVER.batteryCapacityKwh, app.progress?.traveledKm ?? 0, 5, environment);
socAtArrival = h.socAtArrivalPct;
}

const card = copilotFeed.evaluate({
navigating: true,
socPct: d.soc,
socAtArrivalPct: socAtArrival,
speedKmh: d.speedKmh,
powerKw: d.powerKw,
batteryTempC: d.batteryTempC,
regenKwhTrip: trip?.energyRegenKwh ?? 0,
consumptionWhPerKm: consumption,
nominalWhPerKm: NOMINAL_WH_KM,
remainingKm: app.progress?.remainingKm ?? null,
cheaperChargerAheadKm: null, // aguarda fonte de precos (parceria)
});
if (card) app.pushCard(card);
app.expireCards();
}, 2000);
return () => clearInterval(timer);
}, [mode]);
}
