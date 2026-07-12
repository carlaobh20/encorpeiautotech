import { useEffect, useRef } from 'react';
import { useLocationStore } from '../../stores/locationStore';
import { useAppStore } from '../../stores/appStore';
import { useCopilot } from '../../hooks/useCopilot';
import { pointAhead, bearingDeg } from '../../modules/navigation/geo';
import { rangeRadiusKm } from '../../modules/intelligence/EnergyHorizon';
import { useVehicleStore } from '../../stores/vehicleStore';
import { AION_UT_DRIVER } from '../../modules/vehicle/drivers/aion-ut';

/**
 * LiveMap — o palco unico do produto, vivo em todos os modos.
 *
 * A camera e um personagem: zoom respira com a velocidade, o rumo
 * antecipa a curva olhando um ponto a frente NA ROTA, o pitch sobe
 * em avenida e desce na conversao. Energy Map pinta a rota por
 * eficiencia; Range Map desenha ate onde a carga leva.
 */

declare global { interface Window { maplibregl: any } }

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [-43.9345, -19.9167];

const SEG_COLOR: Record<string, string> = { eco: '#3ddcc4', normal: '#ffb04a', high: '#ff6b6b' };

function carElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'car-marker';
  el.innerHTML =
    '<svg width="40" height="40" viewBox="0 0 40 40">' +
    '<circle cx="20" cy="20" r="18" fill="rgba(61,220,196,0.15)"/>' +
    '<circle cx="20" cy="20" r="12" fill="#0b0f14" stroke="#3ddcc4" stroke-width="2.5"/>' +
    '<path d="M20 10.5 L26 24.5 L20 21 L14 24.5 Z" fill="#3ddcc4"/>' +
    '</svg>';
  return el;
}

function destElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'dest-marker';
  el.innerHTML =
    '<svg width="30" height="38" viewBox="0 0 30 38">' +
    '<path d="M15 2 C8 2 3 7.5 3 14 C3 23 15 36 15 36 C15 36 27 23 27 14 C27 7.5 22 2 15 2 Z" fill="#ffb04a" stroke="#0b0f14" stroke-width="2"/>' +
    '<circle cx="15" cy="14" r="4.5" fill="#0b0f14"/></svg>';
  return el;
}

function socBadge(soc: number, isArrival: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'soc-badge' + (isArrival ? ' soc-badge-arrival' : '');
  el.textContent = soc + '%';
  return el;
}

/** zoom em funcao da velocidade — o mapa "respira" com o carro */
function zoomForSpeed(kmh: number): number {
  if (kmh <= 5) return 17;
  if (kmh >= 120) return 14.4;
  return 17 - (kmh / 120) * 2.6;
}

function circlePolygon(lat: number, lng: number, radiusKm: number, points = 64): number[][] {
  const coords: number[][] = [];
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    coords.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return coords;
}

export function LiveMap() {
  const mode = useAppStore((s) => s.mode);
  const plan = useAppStore((s) => s.plan);
  const progress = useAppStore((s) => s.progress);
  const position = useLocationStore((s) => s.position);
  const follow = useLocationStore((s) => s.follow);
  const setFollow = useLocationStore((s) => s.setFollow);
  const { horizon } = useCopilot();
  const soc = useVehicleStore((s) => s.data.soc);

  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const ready = useRef(false);
  const carMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const socMarkers = useRef<any[]>([]);
  const lastCam = useRef(0);

  // ---------- init ----------
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      if (map.current) { clearInterval(timer); return; }
      const gl = window.maplibregl;
      if (!gl || !mapRef.current) { if (++tries > 60) clearInterval(timer); return; }
      clearInterval(timer);
      const m = new gl.Map({
        container: mapRef.current, style: STYLE_URL,
        center: DEFAULT_CENTER, zoom: 14.5, pitch: 45, bearing: 0, attributionControl: false,
      });
      m.on('load', () => {
        try {
          m.addLayer({
            id: 'buildings-3d', type: 'fill-extrusion', source: 'openmaptiles',
            'source-layer': 'building', minzoom: 14.5,
            paint: {
              'fill-extrusion-color': '#26313d',
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
              'fill-extrusion-opacity': 0.85,
            },
          });
        } catch (_) { /* estilo sem buildings */ }
        m.addSource('range', { type: 'geojson', data: empty('Polygon') });
        m.addLayer({ id: 'range-fill', type: 'fill', source: 'range', paint: { 'fill-color': '#3ddcc4', 'fill-opacity': 0.05 } });
        m.addLayer({ id: 'range-line', type: 'line', source: 'range', paint: { 'line-color': '#3ddcc4', 'line-width': 1.6, 'line-opacity': 0.45, 'line-dasharray': [2, 2] } });
        m.addSource('route', { type: 'geojson', data: empty('LineString') });
        m.addLayer({
          id: 'route-casing', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#0b0f14', 'line-width': 11, 'line-opacity': 0.65 },
        });
        m.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 6.5, 'line-opacity': 0.95 },
        });
        ready.current = true;
        m.resize();
      });
      // So gesto DO USUARIO desliga o follow — movimento programatico da camera nao conta.
      m.on('dragstart', (e: any) => { if (e?.originalEvent) setFollow(false); });
      m.on('rotatestart', (e: any) => { if (e?.originalEvent) setFollow(false); });
      map.current = m;
    }, 100);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- rota + Energy Map ----------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource('route');
    if (!src) return;
    if (!plan) { src.setData(emptyFC()); clearSoc(); if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; } return; }

    const feats: any[] = [];
    const segs = horizon?.segments?.length
      ? horizon.segments
      : [{ fromIdx: 0, toIdx: plan.geometry.length - 1, level: 'normal' as const, whPerKm: 0 }];
    for (const seg of segs) {
      const coords = plan.geometry.slice(seg.fromIdx, Math.max(seg.fromIdx + 2, seg.toIdx + 1)).map((p) => [p.lng, p.lat]);
      if (coords.length < 2) continue;
      feats.push({ type: 'Feature', properties: { color: SEG_COLOR[seg.level] }, geometry: { type: 'LineString', coordinates: coords } });
    }
    src.setData({ type: 'FeatureCollection', features: feats });

    const gl = window.maplibregl;
    if (destMarker.current) destMarker.current.remove();
    destMarker.current = new gl.Marker({ element: destElement(), anchor: 'bottom' })
      .setLngLat([plan.to.lng, plan.to.lat]).addTo(m);

    // Energy Horizon: marcos de SOC na rota
    clearSoc();
    if (horizon) {
      for (const ms of horizon.milestones) {
        socMarkers.current.push(
          new gl.Marker({ element: socBadge(ms.socPct, ms.isArrival) })
            .setLngLat([ms.coord.lng, ms.coord.lat]).addTo(m)
        );
      }
    }

    // Planejamento: enquadra a rota inteira
    if (mode === 'planning') {
      let minx = 180, miny = 90, maxx = -180, maxy = -90;
      for (const p of plan.geometry) { minx = Math.min(minx, p.lng); maxx = Math.max(maxx, p.lng); miny = Math.min(miny, p.lat); maxy = Math.max(maxy, p.lat); }
      m.fitBounds([[minx, miny], [maxx, maxy]], { padding: { top: 90, bottom: 330, left: 46, right: 46 }, pitch: 30, duration: 900 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, horizon?.segments?.length, horizon?.milestones?.map((x) => x.socPct).join(','), mode]);

  function clearSoc() { socMarkers.current.forEach((x) => x.remove()); socMarkers.current = []; }

  // ---------- Range Map ----------
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const src = m.getSource('range');
    if (!src) return;
    if (mode === 'navigation' || !position || soc === null) { src.setData(emptyFC()); return; }
    const wh = 1000 / AION_UT_DRIVER.nominalKmPerKwh;
    const radius = rangeRadiusKm(soc, AION_UT_DRIVER.batteryCapacityKwh, wh);
    src.setData({
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [circlePolygon(position.lat, position.lng, radius)] },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, position?.lat, position?.lng, soc]);

  // ---------- carro + camera viva ----------
  useEffect(() => {
    const gl = window.maplibregl;
    const m = map.current;
    if (!gl || !m || !position) return;

    if (!carMarker.current) {
      carMarker.current = new gl.Marker({ element: carElement(), rotationAlignment: 'map' })
        .setLngLat([position.lng, position.lat]).addTo(m);
      m.jumpTo({ center: [position.lng, position.lat], zoom: 16 });
    } else {
      carMarker.current.setLngLat([position.lng, position.lat]);
    }
    if (position.headingDeg !== null) carMarker.current.setRotation(position.headingDeg);
    if (!follow) return;

    const now = performance.now();
    if (now - lastCam.current < 450) return; // camera a ~2Hz: suave, sem brigar com o easeTo
    lastCam.current = now;

    const speed = position.speedKmh ?? 0;
    let bearing = position.headingDeg ?? m.getBearing();
    let zoom = zoomForSpeed(speed);
    let pitch = 58;

    if (mode === 'navigation' && plan && progress) {
      // antecipa a curva: olha um ponto a frente proporcional a velocidade
      const aheadKm = Math.max(0.09, (speed / 3600) * 8); // ~8s a frente
      const target = pointAhead(plan.geometry, plan.cumKm, progress.routeIdx, aheadKm);
      bearing = bearingDeg({ lat: position.lat, lng: position.lng }, target);
      // aproxima e baixa a camera perto da conversao
      if (progress.distToManeuverM < 300) { zoom = Math.max(zoom, 16.6); pitch = 52; }
      else if (speed > 75) pitch = 62; // avenida/rodovia: camera sobe
    }

    m.easeTo({
      center: [position.lng, position.lat],
      bearing, zoom, pitch,
      duration: 850, easing: (t: number) => t,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, position?.headingDeg, follow, mode]);

  return (
    <div className="livemap-wrap">
      <div ref={mapRef} className="livemap" />
      {!follow && position && (
        <button className="recenter-btn" onClick={() => setFollow(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 3 L18 20 L12 16 L6 20 Z" fill="currentColor" /></svg>
          Seguir
        </button>
      )}
    </div>
  );
}

function empty(type: 'LineString' | 'Polygon') {
  return { type: 'Feature', properties: {}, geometry: { type, coordinates: type === 'Polygon' ? [[]] : [] } };
}
function emptyFC() { return { type: 'FeatureCollection', features: [] }; }
