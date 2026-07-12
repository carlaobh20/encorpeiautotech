import { useMemo } from 'react';
import { useVehicleStore } from '../stores/vehicleStore';
import { useLocationStore } from '../stores/locationStore';
import { AION_UT_DRIVER } from '../modules/vehicle/drivers/aion-ut';
import { haversineKm } from '../modules/trip/TripEngine';
import { predict, socAtArrivalIfSlower, type Prediction, type PredictionInput } from '../modules/intelligence/PredictionEngine';
import { deriveInsights, type Insight } from '../modules/intelligence/InsightEngine';
import { assessHealth, type HealthReport } from '../modules/intelligence/HealthEngine';

/**
 * useCopilot — o ponto unico onde os tres engines encontram os dados vivos.
 *
 * Le VehicleData (simulador hoje, gateway/BLE amanha) + GPS + destino e
 * devolve previsao, insights e saude ja prontos para a UI. Nenhum
 * componente calcula nada: so exibe o que sai daqui.
 */

const ROAD_FACTOR = 1.25;              // rota real ~25% maior que a linha reta
const FALLBACK_WH_PER_KM = Math.round(1000 / AION_UT_DRIVER.nominalKmPerKwh);

export interface CopilotView {
  prediction: Prediction | null;
  insights: Insight[];
  health: HealthReport;
  distanceRemainingKm: number | null;
  /** Consumo recente usado no calculo (Wh/km) — transparencia do modelo. */
  consumptionWhPerKm: number;
  /** Eficiencia atual em kWh/100km para exibicao. */
  efficiencyKwh100: number | null;
}

export function useCopilot(): CopilotView {
  const data = useVehicleStore((s) => s.data);
  const currentTrip = useVehicleStore((s) => s.currentTrip);
  const history = useVehicleStore((s) => s.tripHistory);
  const position = useLocationStore((s) => s.position);
  const destination = useLocationStore((s) => s.destination);

  return useMemo(() => {
    // --- consumo recente (Wh/km) ---
    let consumption = FALLBACK_WH_PER_KM;
    if (currentTrip && currentTrip.distanceKm > 0.8) {
      const netKwh = Math.max(0.05, currentTrip.energyUsedKwh - currentTrip.energyRegenKwh);
      consumption = (netKwh / currentTrip.distanceKm) * 1000;
    } else if (data.consumptionKwh100 !== null && data.consumptionKwh100 > 0) {
      consumption = data.consumptionKwh100 * 10;
    }

    // --- media historica p/ delta de eficiencia ---
    const past = history.filter((t) => t.distanceKm > 2);
    let efficiencyDeltaPct: number | null = null;
    if (past.length >= 2 && currentTrip && currentTrip.distanceKm > 1) {
      const avg = past.reduce((s, t) => s + (t.energyUsedKwh - t.energyRegenKwh) / t.distanceKm, 0) / past.length * 1000;
      if (avg > 0) efficiencyDeltaPct = ((consumption - avg) / avg) * 100;
    }

    // --- distancia restante ate o destino ---
    let distanceRemainingKm: number | null = null;
    if (position && destination) {
      distanceRemainingKm = haversineKm(position.lat, position.lng, destination.lat, destination.lng) * ROAD_FACTOR;
    }

    // --- previsao ---
    const speed = data.speedKmh ?? position?.speedKmh ?? 0;
    let prediction: Prediction | null = null;
    let slowerHint: { deltaSpeedKmh: number; socPct: number } | null = null;
    if (data.soc !== null && distanceRemainingKm !== null && distanceRemainingKm > 0.3) {
      const input: PredictionInput = {
        socPct: data.soc,
        packUsableKwh: AION_UT_DRIVER.batteryCapacityKwh,
        distanceRemainingKm,
        recentConsumptionWhPerKm: consumption,
        speedKmh: speed,
      };
      prediction = predict(input);
      if (speed > 55) {
        slowerHint = { deltaSpeedKmh: 10, socPct: socAtArrivalIfSlower(input, 10) };
      }
    }

    const insights = deriveInsights({
      prediction,
      powerKw: data.powerKw,
      batteryTempC: data.batteryTempC,
      speedKmh: data.speedKmh,
      slowerHint,
      efficiencyDeltaPct,
    });

    const health = assessHealth(data);

    return {
      prediction,
      insights,
      health,
      distanceRemainingKm,
      consumptionWhPerKm: Math.round(consumption),
      efficiencyKwh100: consumption > 0 ? Math.round(consumption) / 10 : null,
    };
  }, [data, currentTrip, history, position, destination]);
}
