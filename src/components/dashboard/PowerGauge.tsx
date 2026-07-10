import { useVehicleStore } from '../../stores/vehicleStore';

/**
 * Arco de fluxo de energia — assinatura visual do app.
 * A partir do zero (topo), consumo varre para a direita em âmbar;
 * regeneração varre para a esquerda em teal. Velocidade no centro.
 */

const MAX_POWER = 120; // kW (fim da escala de consumo)
const MAX_REGEN = 40;  // kW (fim da escala de regeneração)
const R = 120;
const CX = 150;
const CY = 150;
const ARC_START = -210; // graus (esq. inferior)
const ARC_END = 30;     // graus (dir. inferior)
const ZERO_ANGLE = -156; // ponto zero deslocado: regen tem menos curso

function polar(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arcPath(fromDeg: number, toDeg: number, r: number) {
  const s = polar(fromDeg, r);
  const e = polar(toDeg, r);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  const sweep = toDeg > fromDeg ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
}

export function PowerGauge() {
  const power = useVehicleStore((s) => s.data.powerKw) ?? 0;
  const speed = useVehicleStore((s) => s.data.speedKmh);
  const gear = useVehicleStore((s) => s.data.gear);

  const regenSpan = ZERO_ANGLE - ARC_START; // graus disponíveis p/ regen
  const drawSpan = ARC_END - ZERO_ANGLE;    // graus disponíveis p/ consumo

  let fillPath: string | null = null;
  let fillColor = 'var(--amber)';
  if (power > 0.5) {
    const frac = Math.min(power / MAX_POWER, 1);
    fillPath = arcPath(ZERO_ANGLE, ZERO_ANGLE + frac * drawSpan, R);
    fillColor = 'var(--amber)';
  } else if (power < -0.5) {
    const frac = Math.min(-power / MAX_REGEN, 1);
    fillPath = arcPath(ZERO_ANGLE, ZERO_ANGLE - frac * regenSpan, R);
    fillColor = 'var(--teal)';
  }

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 300 240" className="gauge">
        {/* trilho */}
        <path d={arcPath(ARC_START, ARC_END, R)} className="gauge-track" />
        {/* marca do zero */}
        {(() => {
          const p1 = polar(ZERO_ANGLE, R - 10);
          const p2 = polar(ZERO_ANGLE, R + 10);
          return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="gauge-zero" />;
        })()}
        {/* preenchimento animado */}
        {fillPath && (
          <path
            d={fillPath}
            className="gauge-fill"
            style={{ stroke: fillColor, filter: `drop-shadow(0 0 6px ${power < 0 ? 'rgba(61,220,196,.55)' : 'rgba(255,176,74,.45)'})` }}
          />
        )}
      </svg>
      <div className="gauge-center">
        <div className="gauge-speed">{speed ?? '—'}</div>
        <div className="gauge-unit">km/h · {gear}</div>
        <div className={`gauge-power ${power < -0.5 ? 'is-regen' : ''}`}>
          {power < -0.5 ? '↓ ' : ''}
          {Math.abs(power).toFixed(0)} kW
          {power < -0.5 ? ' regen' : ''}
        </div>
      </div>
    </div>
  );
}
