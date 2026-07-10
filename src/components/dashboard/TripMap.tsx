import { useEffect, useRef, useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import type { GeoPoint } from '../../modules/trip/TripEngine';

// Leaflet é carregado via CDN no index.html (window.L). Sem chave de API.
declare global { interface Window { L: any } }

const geoCache = new Map<string, string>();
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = lat.toFixed(4) + ',' + lng.toFixed(4);
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4500);
    const r = await fetch(
      'https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&lat=' + lat + '&lon=' + lng,
      { signal: ctrl.signal, headers: { 'Accept-Language': 'pt-BR' } }
    );
    clearTimeout(t);
    const j = await r.json();
    const a = j.address || {};
    const name = [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.village]
      .filter(Boolean).slice(0, 2).join(', ') || j.display_name?.split(',').slice(0, 2).join(',') || key;
    geoCache.set(key, name);
    return name;
  } catch {
    return lat.toFixed(4) + ', ' + lng.toFixed(4);
  }
}

export function TripMap() {
  const current = useVehicleStore((s) => s.currentTrip);
  const history = useVehicleStore((s) => s.tripHistory);
  const trip = current || history[0] || null;
  const path: GeoPoint[] = trip?.path ?? [];

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const lineRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [names, setNames] = useState<{ origin?: string; dest?: string }>({});

  // Inicializa o mapa uma vez (quando o Leaflet estiver disponível)
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      if (mapObj.current) { clearInterval(timer); return; }
      const L = window.L;
      if (!L || !mapRef.current) { if (++tries > 40) clearInterval(timer); return; }
      clearInterval(timer);
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
        .setView([-19.9167, -43.9345], 12); // fallback: BH
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapObj.current = map;
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Redesenha rota + marcadores quando o trajeto muda
  useEffect(() => {
    const L = window.L;
    const map = mapObj.current;
    if (!L || !map) return;

    if (lineRef.current) { map.removeLayer(lineRef.current); lineRef.current = null; }
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    if (path.length === 0) return;
    const latlngs = path.map((p) => [p.lat, p.lng]);
    lineRef.current = L.polyline(latlngs, { color: '#38e0c0', weight: 5, opacity: 0.9 }).addTo(map);

    const mk = (p: GeoPoint, color: string, label: string) =>
      L.circleMarker([p.lat, p.lng], { radius: 8, color: '#0b0f14', weight: 2, fillColor: color, fillOpacity: 1 })
        .addTo(map).bindTooltip(label, { permanent: false });

    const o = trip?.origin ?? path[0];
    const d = trip?.destination ?? path[path.length - 1];
    if (o) markersRef.current.push(mk(o, '#38e0c0', 'Origem'));
    if (d && path.length > 1) markersRef.current.push(mk(d, '#ff7a7a', 'Destino'));

    map.fitBounds(lineRef.current.getBounds(), { padding: [24, 24], maxZoom: 16 });
  }, [path.length, trip?.id]);

  // Nomes de origem/destino (melhor esforço; cai pra coordenada se falhar)
  useEffect(() => {
    const o = trip?.origin, d = trip?.destination;
    if (o) reverseGeocode(o.lat, o.lng).then((n) => setNames((s) => ({ ...s, origin: n })));
    if (d) reverseGeocode(d.lat, d.lng).then((n) => setNames((s) => ({ ...s, dest: n })));
    else setNames((s) => ({ ...s, dest: undefined }));
  }, [trip?.origin?.lat, trip?.destination?.lat, trip?.id]);

  const live = !!current;
  const hasGeo = path.length > 0;

  return (
    <section className="card" aria-label="Mapa da viagem">
      <header className="card-head">
        <span className="card-label">{live ? 'Trajeto ao vivo' : 'Última viagem'}</span>
        <span className="card-aux">{hasGeo ? (trip?.gpsDistanceKm?.toFixed(1) + ' km GPS') : 'sem GPS'}</span>
      </header>
      <div ref={mapRef} style={{ height: 260, borderRadius: 10, overflow: 'hidden', background: '#0e141b' }} />
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: '#9fb0c0' }}>
        {hasGeo ? (
          <>
            <div>De: <b style={{ color: '#38e0c0' }}>{names.origin ?? '...'}</b></div>
            {trip?.destination
              ? <div>Para: <b style={{ color: '#ff7a7a' }}>{names.dest ?? '...'}</b></div>
              : <div style={{ color: '#7a8794' }}>Destino: em andamento</div>}
          </>
        ) : (
          <div style={{ color: '#7a8794' }}>
            Inicie uma viagem e permita a localização (GPS) para registrar origem e destino.
          </div>
        )}
      </div>
    </section>
  );
}
