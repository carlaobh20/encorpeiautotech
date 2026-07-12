import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * BottomSheet premium — 3 estados: peek (fechado), half (meio), full (aberto).
 * Arrasta pelo handle ou por qualquer ponto do cabecalho; solta e ele
 * encaixa no estado mais proximo considerando a velocidade do gesto.
 */

export type SheetState = 'peek' | 'half' | 'full';

interface Props {
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  /** Altura visivel no estado peek, em px. */
  peekHeight?: number;
  children: ReactNode;
}

const SNAP: Record<SheetState, number> = { peek: 0, half: 0.46, full: 0.88 };
const ORDER: SheetState[] = ['peek', 'half', 'full'];

export function BottomSheet({ state, onStateChange, peekHeight = 148, children }: Props) {
  const [vh, setVh] = useState(() => window.innerHeight);
  const [dragY, setDragY] = useState<number | null>(null); // deslocamento durante o gesto
  const drag = useRef<{ startY: number; startTop: number; lastY: number; lastT: number; vy: number } | null>(null);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Altura visivel (px) de um estado. */
  const heightOf = (s: SheetState) => (s === 'peek' ? peekHeight : Math.round(vh * SNAP[s]));

  const visible = dragY !== null ? Math.max(peekHeight, Math.min(vh * 0.92, dragY)) : heightOf(state);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startTop: visible, lastY: e.clientY, lastT: performance.now(), vy: 0 };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.vy = (e.clientY - d.lastY) / dt; // px/ms (+ = descendo)
    d.lastY = e.clientY; d.lastT = now;
    setDragY(d.startTop + (d.startY - e.clientY));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (dragY === null || !d) { setDragY(null); return; }

    let target: SheetState;
    if (Math.abs(d.vy) > 0.45) {
      // gesto rapido: vai na direcao do movimento
      const idx = ORDER.indexOf(nearestState(dragY));
      target = d.vy < 0 ? ORDER[Math.min(2, idx + 1)] : ORDER[Math.max(0, idx - 1)];
    } else {
      target = nearestState(dragY);
    }
    setDragY(null);
    onStateChange(target);
  }

  function nearestState(h: number): SheetState {
    let best: SheetState = 'peek';
    let bestDist = Infinity;
    for (const s of ORDER) {
      const dist = Math.abs(heightOf(s) - h);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    return best;
  }

  return (
    <div
      className={'sheet sheet-' + state + (dragY !== null ? ' sheet-dragging' : '')}
      style={{ height: visible }}
      role="dialog"
      aria-label="Painel do copiloto"
    >
      <div
        className="sheet-grip"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => onStateChange(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek')}
      >
        <div className="sheet-handle" />
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
