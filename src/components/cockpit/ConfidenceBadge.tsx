import { useState } from 'react';
import type { ConfidenceReport } from '../../modules/intelligence/ConfidenceEngine';

/**
 * Modo Confianca — o indicador permanente que quase nenhum app tem:
 * quanto da pra confiar na previsao, e POR QUE. Toque abre o checklist.
 */

export function ConfidenceBadge({ report, compact }: { report: ConfidenceReport; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const dot = report.level === 'high' ? 'conf-dot-high' : report.level === 'medium' ? 'conf-dot-med' : 'conf-dot-low';

  return (
    <>
      <button className={'conf-badge conf-' + report.level} onClick={() => setOpen(true)} aria-label="Confiança da previsão">
        <span className={'conf-dot ' + dot} />
        {compact ? report.pct + '%' : 'Confiança ' + report.pct + '%'}
      </button>

      {open && (
        <div className="conf-overlay" onClick={() => setOpen(false)}>
          <div className="conf-card" onClick={(e) => e.stopPropagation()}>
            <div className="conf-title">
              <span className={'conf-dot ' + dot} />
              Confiança da previsão · {report.pct}%
            </div>
            <div className="conf-list">
              {report.factors.map((f, i) => (
                <div key={i} className={'conf-row conf-row-' + f.state}>
                  <span className="conf-mark">{f.state === 'ok' ? '✓' : '!'}</span>
                  <span className="conf-text">
                    {f.label}
                    {f.detail && <span className="conf-detail"> · {f.detail}</span>}
                  </span>
                </div>
              ))}
              {report.marginPct !== null && (
                <div className="conf-row conf-row-ok">
                  <span className="conf-mark">◈</span>
                  <span className="conf-text">Margem de segurança: {Math.max(0, report.marginPct)}% acima da reserva</span>
                </div>
              )}
            </div>
            <button className="btn btn-ghost conf-close" onClick={() => setOpen(false)}>Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}
