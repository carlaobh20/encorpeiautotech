import { useEffect, useRef, useState } from 'react';
import { useVehicleStore } from '../../stores/vehicleStore';
import type { GeoPoint } from '../../modules/trip/TripEngine';

// MapLibre GL é carregado via CDN no index.html (window.maplibregl). Sem chave de API.
declare global { interface Window { maplibregl: any } }

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

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

function dot(color: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:' + color +
    ';border:2px solid #0b0f14;box-shadow:0 0 0 2px ' + color + '55';
  return el;
}

export function TripMap() {
  const current = useVehicleStore((s) => s.currentTrip);
  const history = useVehicleStore((s) => s.tripHistory);
  const trip = current || history[0] || null;
  const path: GeoPoint[] = trip?.path ?? [];

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const ready = useRef(false);
  const markers = useRef<any[]>([]);
  const [names, setNames] = useState<{ origin?: string; dest?: string }>({});

  // Inicializa o mapa 3D uma vez
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      if (mapObj.current) { clearInterval(timer); return; }
      const gl = window.maplibregl;
      if (!gl || !mapRef.current) { if (++tries > 60) clearInterval(timer); return; }
      clearInterval(timer);
      const map = new gl.Map({
        container: mapRef.current,
        style: STYLE_URL,
        center: [-43.9345, -19.9167], // BH (lng, lat)
        zoom: 15,
        pitch: 60,
        bearing: -20,
        attributionControl: true,
      });
      map.addControl(new gl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', () => {
        // Prédios em 3D (o efeito 3D vem daqui + inclinação; sem terreno DEM que trava render)
        try {
          map.addLayer({
            id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles',
            'source-layer': 'building', minzoom: 14,
            paint: {
              'fill-extrusion-color': '#26313d',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.9,
            },
          });
        } catch (_) { /* estilo sem building: ok */ }
        // Fonte/camada da rota
        map.addSource('route', { type: 'geojson', data: emptyLine() });
        map.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#38e0c0', 'line-width': 6, 'line-opacity': 0.95 },
        });
        ready.current = true;
        map.resize();
        drawRoute();
      });
      mapObj.current = map;
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emptyLine() {
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } };
  }

  function drawRoute() {
    const gl = window.maplibregl;
    const map = mapObj.current;
    if (!gl || !map || !ready.current) return;
    const coords = path.map((p) => [p.lng, p.lat]);
    const src = map.getSource('route');
    if (src) src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });

    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (coords.length === 0) return;

    const o = trip?.origin ?? path[0];
    const d = trip?.destination ?? path[path.length - 1];
    if (o) markers.current.push(new gl.Marker({ element: dot('#38e0c0') }).setLngLat([o.lng, o.lat]).addTo(map));
    if (d && coords.length > 1) markers.current.push(new gl.Marker({ element: dot('#ff7a7a') }).setLngLat([d.lng, d.lat]).addTo(map));

    if (coords.length >= 2) {
      let minx = 180, miny = 90, maxx = -180, maxy = -90;
      for (const c of coords) { minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]); miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]); }
      map.fitBounds([[minx, miny], [maxx, maxy]], { padding: 60, duration: 700 });
      setTimeout(() => { try { map.easeTo({ pitch: 55, duration: 500 }); } catch (_) {} }, 800);
    } else {
      map.easeTo({ center: coords[0], zoom: 16, pitch: 60, duration: 700 });
    }
  }

  useEffect(() => { drawRoute(); /* eslint-disable-next-line */ }, [path.length, trip?.id]);

  useEffect(() => {
    const o = trip?.origin, d = trip?.destination;
    if (o) reverseGeocode(o.lat, o.lng).then((n) => setNames((s) => ({ ...s, origin: n })));
    if (d) reverseGeocode(d.lat, d.lng).then((n) => setNames((s) => ({ ...s, dest: n })));
    else setNames((s) => ({ ...s, dest: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.origin?.lat, trip?.destination?.lat, trip?.id]);

  const live = !!current;
  const hasGeo = path.length > 0;

  return (
    <section className="card" aria-label="Mapa 3D da viagem">
      <header className="card-head">
        <span className="card-label">{live ? 'Trajeto ao vivo (3D)' : 'Mapa 3D'}</span>
        <span className="card-aux">{hasGeo ? (trip?.gpsDistanceKm?.toFixed(1) + ' km GPS') : 'sem GPS'}</span>
      </header>
      <div ref={mapRef} style={{ height: 300, borderRadius: 10, overflow: 'hidden', background: '#0e141b' }} />
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
            Arraste com dois dedos para girar/inclinar o mapa 3D. Inicie uma viagem e permita o GPS para registrar o trajeto.
          </div>
        )}
      </div>
    </section>
  );
}
