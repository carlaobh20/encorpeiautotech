import { useEffect, useRef } from 'react';
import { useLocationStore } from '../../stores/locationStore';

/**
 * O palco do cockpit: mapa 3D em tela cheia, carro seguindo a posicao,
 * camera acompanhando. Toque longo (ou clique) define o destino.
 * MapLibre GL vem do CDN (window.maplibregl), como no TripMap.
 */

declare global { interface Window { maplibregl: any } }

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [-43.9345, -19.9167]; // BH

function carElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'car-marker';
  el.innerHTML =
    '<svg width="34" height="34" viewBox="0 0 34 34">' +
    '<circle cx="17" cy="17" r="15" fill="rgba(61,220,196,0.18)"/>' +
    '<circle cx="17" cy="17" r="10" fill="#0b0f14" stroke="#3ddcc4" stroke-width="2"/>' +
    '<path d="M17 9 L22 21 L17 18 L12 21 Z" fill="#3ddcc4"/>' +
    '</svg>';
  return el;
}

function destElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dest-marker';
  el.innerHTML =
    '<svg width="30" height="38" viewBox="0 0 30 38">' +
    '<path d="M15 2 C8 2 3 7.5 3 14 C3 23 15 36 15 36 C15 36 27 23 27 14 C27 7.5 22 2 15 2 Z" ' +
    'fill="#ffb04a" stroke="#0b0f14" stroke-width="2"/>' +
    '<circle cx="15" cy="14" r="4.5" fill="#0b0f14"/>' +
    '</svg>';
  return el;
}

async function reverseName(lat: number, lng: number): Promise<string> {
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
    return [a.road, a.suburb || a.neighbourhood, a.city || a.town]
      .filter(Boolean).slice(0, 2).join(', ') || lat.toFixed(4) + ', ' + lng.toFixed(4);
  } catch {
    return lat.toFixed(4) + ', ' + lng.toFixed(4);
  }
}

export function CockpitMap() {
  const position = useLocationStore((s) => s.position);
  const destination = useLocationStore((s) => s.destination);
  const follow = useLocationStore((s) => s.follow);
  const setFollow = useLocationStore((s) => s.setFollow);
  const setDestination = useLocationStore((s) => s.setDestination);
  const setDestinationName = useLocationStore((s) => s.setDestinationName);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const ready = useRef(false);
  const carMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);

  // Inicializa o mapa uma vez
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
        center: DEFAULT_CENTER,
        zoom: 15.5,
        pitch: 58,
        bearing: 0,
        attributionControl: false,
      });

      map.on('load', () => {
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
        map.addSource('guide', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
        });
        map.addLayer({
          id: 'guide-line', type: 'line', source: 'guide',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#3ddcc4', 'line-width': 5, 'line-opacity': 0.85, 'line-dasharray': [0.5, 1.6] },
        });
        ready.current = true;
        map.resize();
      });

      // Usuario mexeu no mapa → camera para de seguir (ate tocar em recentrar)
      map.on('dragstart', () => setFollow(false));
      map.on('rotatestart', () => setFollow(false));

      // Clique define destino
      map.on('click', (e: any) => {
        const d = { lat: e.lngLat.lat, lng: e.lngLat.lng, name: null };
        setDestination(d);
        reverseName(d.lat, d.lng).then((n) => setDestinationName(n));
      });

      mapObj.current = map;
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carro segue a posicao + camera acompanha
  useEffect(() => {
    const gl = window.maplibregl;
    const map = mapObj.current;
    if (!gl || !map || !position) return;

    if (!carMarker.current) {
      carMarker.current = new gl.Marker({ element: carElement(), rotationAlignment: 'map' })
        .setLngLat([position.lng, position.lat]).addTo(map);
      map.jumpTo({ center: [position.lng, position.lat], zoom: 16 });
    } else {
      carMarker.current.setLngLat([position.lng, position.lat]);
    }
    if (position.headingDeg !== null) carMarker.current.setRotation(position.headingDeg);

    if (follow) {
      map.easeTo({
        center: [position.lng, position.lat],
        bearing: position.headingDeg ?? map.getBearing(),
        pitch: 58,
        duration: 900,
        easing: (t: number) => t,
      });
    }
    updateGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, position?.headingDeg, follow]);

  // Destino: marcador + linha-guia
  useEffect(() => {
    const gl = window.maplibregl;
    const map = mapObj.current;
    if (!gl || !map) return;
    if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; }
    if (destination) {
      destMarker.current = new gl.Marker({ element: destElement(), anchor: 'bottom' })
        .setLngLat([destination.lng, destination.lat]).addTo(map);
    }
    updateGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng]);

  function updateGuide() {
    const map = mapObj.current;
    if (!map || !ready.current) return;
    const src = map.getSource('guide');
    if (!src) return;
    const pos = useLocationStore.getState().position;
    const dest = useLocationStore.getState().destination;
    const coords = pos && dest ? [[pos.lng, pos.lat], [dest.lng, dest.lat]] : [];
    src.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  }

  return (
    <div className="cockpit-map-wrap">
      <div ref={mapRef} className="cockpit-map" />
      {!follow && position && (
        <button className="recenter-btn" onClick={() => setFollow(true)} aria-label="Recentralizar no carro">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3 L18 20 L12 16 L6 20 Z" fill="currentColor" stroke="none" />
          </svg>
          Seguir
        </button>
      )}
    </div>
  );
}
