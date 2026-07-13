/**
 * EnvironmentAdjust — ajustes manuais de clima e carga.
 *
 * Sem OBD ainda: o motorista informa e a IA calcula. Mesmo padrao do
 * SocSlider (mutate store → refreshEnergyPlan). Painel colapsavel pra
 * nao poluir o PlanningScreen quando nao esta em uso.
 */

import { useState } from 'react';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useAppStore } from '../../stores/appStore';

export function EnvironmentAdjust() {
  const [open, setOpen] = useState(false);
  const environment = useEnvironmentStore((s) => s.environment);
  const setEnvironment = useEnvironmentStore((s) => s.setEnvironment);
  const resetEnvironment = useEnvironmentStore((s) => s.resetEnvironment);
  const refreshEnergyPlan = useAppStore((s) => s.refreshEnergyPlan);

  const activeCount = Object.keys(environment).length;

  function apply(patch: Parameters<typeof setEnvironment>[0]) {
    setEnvironment(patch);
    void refreshEnergyPlan();
  }

  function clear() {
    resetEnvironment();
    void refreshEnergyPlan();
  }

  const rain = environment.rain ?? 'none';
  const climateOn = environment.climateOn === true;
  const climateIntensity = environment.climateIntensity ?? 'medium';

  return (
    <div className="env-adjust">
      <button className="env-adjust-toggle" onClick={() => setOpen((v) => !v)}>
        <span>Ajustes de viagem (clima, carga)</span>
        {activeCount > 0 && <span className="env-adjust-badge">{activeCount}</span>}
        <span className="env-adjust-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="env-adjust-panel">
          <div className="env-field">
            <div className="env-field-head">
              <span>Temperatura externa</span>
              <span className="env-field-value">
                {environment.outsideTempC ?? '—'}{environment.outsideTempC !== undefined ? '°C' : ''}
              </span>
            </div>
            <input
              className="env-range"
              type="range"
              min={-5}
              max={42}
              step={1}
              value={environment.outsideTempC ?? 22}
              onChange={(e) => apply({ outsideTempC: Number(e.target.value) })}
            />
          </div>

          <div className="env-field">
            <div className="env-field-head"><span>Chuva</span></div>
            <div className="env-chips">
              <button
                className={`env-chip${rain === 'none' ? ' env-chip-active' : ''}`}
                onClick={() => apply({ rain: 'none' })}
              >Seco</button>
              <button
                className={`env-chip${rain === 'light' ? ' env-chip-active' : ''}`}
                onClick={() => apply({ rain: 'light' })}
              >Chuva leve</button>
              <button
                className={`env-chip${rain === 'heavy' ? ' env-chip-active' : ''}`}
                onClick={() => apply({ rain: 'heavy' })}
              >Chuva forte</button>
            </div>
          </div>

          <div className="env-field">
            <div className="env-field-head">
              <span>Vento (a favor / contra)</span>
              <span className="env-field-value">
                {environment.headwindKmh !== undefined
                  ? `${environment.headwindKmh > 0 ? '+' : ''}${environment.headwindKmh} km/h`
                  : '—'}
              </span>
            </div>
            <input
              className="env-range"
              type="range"
              min={-30}
              max={30}
              step={5}
              value={environment.headwindKmh ?? 0}
              onChange={(e) => apply({ headwindKmh: Number(e.target.value) })}
            />
          </div>

          <div className="env-field">
            <div className="env-field-head">
              <span>Peso extra (carga/passageiros)</span>
              <span className="env-field-value">
                {environment.extraWeightKg !== undefined ? `${environment.extraWeightKg} kg` : '—'}
              </span>
            </div>
            <input
              className="env-range"
              type="range"
              min={0}
              max={300}
              step={10}
              value={environment.extraWeightKg ?? 0}
              onChange={(e) => apply({ extraWeightKg: Number(e.target.value) })}
            />
          </div>

          <div className="env-field">
            <div className="env-field-head"><span>Condições</span></div>
            <div className="env-toggles">
              <button
                className={`env-chip${environment.roofCargo ? ' env-chip-active' : ''}`}
                onClick={() => apply({ roofCargo: !environment.roofCargo })}
              >Bagageiro no teto</button>
              <button
                className={`env-chip${environment.towing ? ' env-chip-active' : ''}`}
                onClick={() => apply({ towing: !environment.towing })}
              >Reboque</button>
              <button
                className={`env-chip${climateOn ? ' env-chip-active' : ''}`}
                onClick={() => apply({ climateOn: !climateOn })}
              >Ar-condicionado ligado</button>
            </div>
          </div>

          {climateOn && (
            <div className="env-field">
              <div className="env-field-head"><span>Intensidade do climatizador</span></div>
              <div className="env-chips">
                <button
                  className={`env-chip${climateIntensity === 'low' ? ' env-chip-active' : ''}`}
                  onClick={() => apply({ climateIntensity: 'low' })}
                >Baixa</button>
                <button
                  className={`env-chip${climateIntensity === 'medium' ? ' env-chip-active' : ''}`}
                  onClick={() => apply({ climateIntensity: 'medium' })}
                >Média</button>
                <button
                  className={`env-chip${climateIntensity === 'high' ? ' env-chip-active' : ''}`}
                  onClick={() => apply({ climateIntensity: 'high' })}
                >Alta</button>
              </div>
            </div>
          )}

          {activeCount > 0 && (
            <button className="env-clear" onClick={clear}>Limpar ajustes</button>
          )}
        </div>
      )}
    </div>
  );
}
