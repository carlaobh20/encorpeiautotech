import { useEffect, useRef, useState } from 'react';
import { useAppStore, geocode, type Place } from '../../stores/appStore';
import { HealthChip } from '../dashboard/HealthCard';

/**
 * ESTADO 1 — Sem destino. Uma pergunta, nada de sensores:
 * "Para onde vamos?"
 *
 * Sem chips de Casa/Trabalho/recentes por pedido do Carlos — a tela
 * inicial nao expoe enderecos salvos. O botao do menu lateral saiu do
 * header e virou um FAB fixo no canto inferior direito.
 *
 * Carregadores saiu daqui e virou uma categoria real do Menu Lateral
 * (mesma logica, so mudou de lugar). No lugar do chip, a caixa de busca
 * ganhou uma estrela de favoritos: toca pra ver os lugares salvos, ou
 * favorita um resultado de busca direto na lista.
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
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
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
    chooseDestination(p);
  }

  function isFavorite(name: string) {
    return places.favorites.some((f) => f.name === name);
  }

  function favRow(p: Place, key: string | number) {
    const fav = isFavorite(p.name);
    return (
      <div className="search-result-row" key={key}>
        <button className="search-result" onClick={() => pick(p)}>
          <span className="search-result-pin">📍</span>
          <span>{p.name}</span>
        </button>
        <button
          className={`search-result-fav${fav ? ' search-result-fav-active' : ''}`}
          onClick={() => toggleFavorite(p)}
          aria-label={fav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>
    );
  }

  return (
    <div className="search-screen">
      <header className="search-header">
        <div className="brand">
          <span className="brand-name">ENCORPEI</span>
          <span className="brand-sub">AUTO</span>
        </div>
        <HealthChip onClick={onOpenDetails} />
      </header>

      <button className="menu-fab" onClick={onOpenMenu} aria-label="Abrir menu">☰</button>

      <div className="search-hero">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Para onde vamos?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <button
            className={`search-star${showFavorites ? ' search-star-active' : ''}`}
            onClick={() => setShowFavorites((v) => !v)}
            aria-label="Favoritos"
          >
            {showFavorites ? '★' : '☆'}
          </button>
        </div>

        {q.trim().length >= 3 && (
          <div className="search-results">
            {searching && <div className="search-hint">Buscando…</div>}
            {!searching && results.length === 0 && <div className="search-hint">Nenhum resultado. Tente incluir a cidade.</div>}
            {results.map((r, i) => favRow(r, i))}
          </div>
        )}

        {q.trim().length < 3 && showFavorites && (
          <div className="search-results">
            <div className="search-results-head">
              <span>Favoritos</span>
              <button className="search-cancel" onClick={() => setShowFavorites(false)}>✕</button>
            </div>
            {places.favorites.length === 0 && (
              <div className="search-hint">Nenhum favorito ainda. Busque um endereço e toque na estrela pra salvar.</div>
            )}
            {places.favorites.map((p, i) => favRow(p, i))}
          </div>
        )}
      </div>
    </div>
  );
}
