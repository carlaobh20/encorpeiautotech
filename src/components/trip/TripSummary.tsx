import { useEffect, useRef } from 'react';
import type { TripRecord } from '../../modules/trip/TripEngine';

/**
 * Resumo de viagem — o "cartao final" elegante que aparece ao encerrar
 * uma viagem (e ao tocar numa viagem do historico).
 */

declare global { interface Window { maplibregl: any } }
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return totalMin + ' min';
  return Math.floor(totalMin / 60) + 'h' + String(totalMin % 60).padStart(2, '0');
}

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="sum-metric">
      <div className="sum-metric-value" style={accent ? { color: accent } : undefined}>
        {value}{unit && <span className="sum-metric-unit"> {unit}</span>}
      </div>
      <div className="sum-metric-label">{label}</div>
    </div>
  );
}

export function TripSummary({ trip, onClose }: { trip: TripRecord; onClose: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);

  const netKwh = Math.max(0, trip.energyUsedKwh - trip.energyRegenKwh);
  const dist = Math.max(trip.distanceKm, trip.gpsDistanceKm);
  const kwh100 = dist > 0.3 ? (netKwh / dist) * 100 : null;
  const kmPerKwh = netKwh > 0.05 && dist > 0.3 ? dist / netKwh : null;
  const regenPct = trip.energyUsedKwh > 0.05 ? (trip.energyRegenKwh / trip.energyUsedKwh) * 100 : null;
  const socDrop = trip.socStart !== null && trip.socEnd !== null ? trip.socStart - trip.socEnd : null;

  // Mini mapa com o trajeto percorrido
  useEffect(() => {
    const gl = window.maplibregl;
    if (!gl || !mapRef.current || trip.path.length < 2) return;
    const coords = trip.path.map((p) => [p.lng, p.lat]);
    let minx = 180, miny = 90, maxx = -180, maxy = -90;
    for (const c of coords) { minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]); miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]); }
    const map = new gl.Map({
      container: mapRef.current,
      style: STYLE_URL,
      bounds: [[minx, miny], [maxx, maxy]],
      fitBoundsOptions: { padding: 42 },
      attributionControl: false,
      interactive: false,
    });
    map.on('load', () => {
      map.addSource('path', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
      });
      map.addLayer({
        id: 'path-line', type: 'line', source: 'path',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3ddcc4', 'line-width': 4, 'line-opacity': 0.95 },
      });
    });
    return () => map.remove();
  }, [trip.id, trip.path.length]);

  const started = new Date(trip.startedAt);

  return (
    <div className="summary-overlay" role="dialog" aria-label="Resumo da viagem">
      <div className="summary-card">
        <header className="summary-head">
          <div>
            <div className="summary-title">Resumo da viagem</div>
            <div className="summary-date">
              {started.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              {' · '}
              {started.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button className="summary-close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        {trip.path.length >= 2 && <div ref={mapRef} className="summary-map" />}

        <div className="summary-hero">
          <Metric label="Distancia" value={dist.toFixed(1)} unit="km" />
          <Metric label="Duracao" value={fmtDuration(trip.durationMs)} />
          <Metric label="Consumo" value={kwh100 !== null ? kwh100.toFixed(1) : '—'} unit="kWh/100km" />
        </div>

        <div className="summary-grid">
          <Metric label="Energia gasta" value={trip.energyUsedKwh.toFixed(2)} unit="kWh" accent="var(--amber)" />
          <Metric label="Regenerada" value={trip.energyRegenKwh.toFixed(2)} unit="kWh" accent="var(--teal)" />
          <Metric label="Recuperacao" value={regenPct !== null ? regenPct.toFixed(0) : '—'} unit="%" accent="var(--teal)" />
          <Metric label="Rendimento" value={kmPerKwh !== null ? kmPerKwh.toFixed(1) : '—'} unit="km/kWh" />
          <Metric label="Vel. media" value={trip.avgSpeedKmh.toFixed(0)} unit="km/h" />
          <Metric label="Vel. maxima" value={trip.maxSpeedKmh.toFixed(0)} unit="km/h" />
        </div>

        {socDrop !== null && (
          <div className="summary-soc">
            <span>Bateria: {trip.socStart!.toFixed(0)}% → {trip.socEnd!.toFixed(0)}%</span>
            <span className="summary-soc-drop">−{socDrop.toFixed(0)} pontos</span>
          </div>
        )}

        <button className="btn btn-primary summary-ok" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
