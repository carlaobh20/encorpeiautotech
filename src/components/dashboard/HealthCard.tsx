import { useState } from 'react';
import { useCopilot } from '../../hooks/useCopilot';
import type { HealthLevel } from '../../modules/intelligence/HealthEngine';

/**
 * A cara do HealthEngine: a nota unica que abre nos subsistemas,
 * em linguagem que qualquer dono de carro entende.
 */

const LEVEL_COLOR: Record<HealthLevel, string> = {
  excellent: 'var(--good)',
  good: 'var(--good)',
  attention: 'var(--warn)',
  critical: 'var(--critical)',
  unknown: 'var(--text-faint)',
};

export function HealthChip({ onClick }: { onClick?: () => void }) {
  const { health } = useCopilot();
  return (
    <button className="health-chip" onClick={onClick} style={{ color: LEVEL_COLOR[health.level] }}>
      <span className="health-chip-dot" style={{ background: LEVEL_COLOR[health.level] }} />
      {health.score !== null ? 'Saude ' + health.score : 'Saude —'}
    </button>
  );
}

export function HealthCard() {
  const { health } = useCopilot();
  const [open, setOpen] = useState(false);

  return (
    <section className="card" aria-label="Saude do veiculo">
      <header className="card-head">
        <span className="card-label">Saude do veiculo</span>
        <button className="card-aux health-toggle" onClick={() => setOpen(!open)}>
          {open ? 'fechar' : 'detalhes'}
        </button>
      </header>

      <div className="health-main">
        <div className="health-score" style={{ color: LEVEL_COLOR[health.level] }}>
          {health.score !== null ? health.score : '—'}
          <span className="health-score-max">/100</span>
        </div>
        <div className="health-headline">{health.headline}</div>
      </div>

      {open && (
        <ul className="health-subs">
          {health.subsystems.map((s) => (
            <li key={s.id} className="health-sub">
              <span className="health-sub-dot" style={{ background: LEVEL_COLOR[s.level] }} />
              <div className="health-sub-text">
                <span className="health-sub-label">
                  {s.label}
                  <b style={{ color: LEVEL_COLOR[s.level] }}>{s.score !== null ? ' ' + s.score : ''}</b>
                </span>
                <span className="health-sub-summary">{s.summary}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
