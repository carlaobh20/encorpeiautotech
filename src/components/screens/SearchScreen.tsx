import { useEffect, useRef, useState } from 'react';
import { useAppStore, geocode, type Place } from '../../stores/appStore';
import { useLocationStore } from '../../stores/locationStore';
import { HealthChip } from '../dashboard/HealthCard';

/**
 * ESTADO 1 — Sem destino. Uma pergunta, nada de sensores:
 * "Para onde vamos?"
 */

export function SearchScreen({
  onOpenDetails,
  onOpenMenu,
}: {
  onOpenDetails: () => void;
  onOpenMenu: () => void;
}) {
  const chooseDestination = useAppStore((s) => s.chooseDestination);
  const places = useAppStore((s) => s.places);
  const setHome = useAppStore((s) => s.setHome);
  const setWork = useAppStore((s) => s.setWork);
  const loadChargersNear = useAppStore((s) => s.loadChargersNear);
  const chargers = useAppStore((s) => s.chargers);
  const chargersLoading = useAppStore((s) => s.chargersLoading);
  const position = useLocationStore((s) => s.position);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [showChargers, setShowChargers] = useState(false);
  const [pendingSave, setPendingSave] = useState<'home' | 'work' | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) { setResults([]); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const r = await geocode(q.trim());
      setResults(r);
      setSearching(false);
    }, 450);
  }, [q]);

  function pick(p: Place) {
    if (pendingSave === 'home') { setHome(p); setPendingSave(null); setQ(''); setResults([]); return; }
    if (pendingSave === 'work') { setWork(p); setPendingSave(null); setQ(''); setResults([]); return; }
    chooseDestination(p);
  }

  function chip(label: string, icon: string, onClick: () => void, sub?: string) {
    return (
      <button className="search-chip" onClick={onClick}>
        <span className="search-chip-icon">{icon}</span>
        <span className="search-chip-label">{label}</span>
        {sub && <span className="search-chip-sub">{sub}</span>}
      </button>
    );
  }

  return (
    <div className="search-screen">
      <header className="search-header">
        <div className="brand">
          <span className="brand-name">ENCORPEI</span>
          <span className="brand-sub">AUTO</span>
        </div>
        <div className="search-header-actions">
          <HealthChip onClick={onOpenDetails} />
          <button className="menu-fab" onClick={onOpenMenu} aria-label="Abrir menu">☰</button>
        </div>
      </header>

      <div className="search-hero">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder={pendingSave ? 'Buscar endereço de ' + (pendingSave === 'home' ? 'casa' : 'trabalho') + '…' : 'Para onde vamos?'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          {pendingSave && <button className="search-cancel" onClick={() => { setPendingSave(null); setQ(''); }}>✕</button>}
        </div>

        {q.trim().length >= 3 && (
          <div className="search-results">
            {searching && <div className="search-hint">Buscando…</div>}
            {!searching && results.length === 0 && <div className="search-hint">Nenhum resultado. Tente incluir a cidade.</div>}
            {results.map((r, i) => (
              <button key={i} className="search-result" onClick={() => pick(r)}>
                <span className="search-result-pin">📍</span>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        )}

        {q.trim().length < 3 && !showChargers && (
          <div className="search-chips">
            {places.home
              ? chip('Casa', '🏠', () => chooseDestination(places.home!))
              : chip('Casa', '🏠', () => setPendingSave('home'), 'definir')}
            {places.work
              ? chip('Trabalho', '💼', () => chooseDestination(places.work!))
              : chip('Trabalho', '💼', () => setPendingSave('work'), 'definir')}
            {chip('Carregadores', '⚡', () => {
              setShowChargers(true);
              if (position) loadChargersNear({ lat: position.lat, lng: position.lng });
            })}
            {places.recents.map((r, i) => (
              <button key={'r' + i} className="search-chip search-chip-recent" onClick={() => chooseDestination(r)}>
                <span className="search-chip-icon">🕓</span>
                <span className="search-chip-label">{r.name.split(',')[0]}</span>
              </button>
            ))}
          </div>
        )}

        {showChargers && (
          <div className="search-results">
            <div className="search-results-head">
              <span>Carregadores próximos</span>
              <button className="search-cancel" onClick={() => setShowChargers(false)}>✕</button>
            </div>
            {chargersLoading && <div className="search-hint">Consultando rede de recarga…</div>}
            {!chargersLoading && chargers.length === 0 && (
              <div className="search-hint">
                {localStorage.getItem('encorpei-auto:ocm-key')
                  ? 'Nenhum carregador encontrado por aqui (base OpenChargeMap).'
                  : 'Rede de carregadores aguardando chave da OpenChargeMap (gratuita).'}
              </div>
            )}
            {chargers.slice(0, 6).map((c) => (
              <button key={c.id} className="search-result" onClick={() => chooseDestination({ name: c.name, lat: c.lat, lng: c.lng })}>
                <span className="search-result-pin">⚡</span>
                <span>
                  {c.name}
                  <span className="search-result-sub"> · {c.powerKw} kW · {c.distanceKm.toFixed(1)} km · {c.operator}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
