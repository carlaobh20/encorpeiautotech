/**
 * Geometria de navegacao — TS puro, zero dependencias.
 */

export interface LatLng { lat: number; lng: number; }

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rumo (graus, 0 = norte) do ponto A para o ponto B. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** Decodifica polyline do OSRM (precisao 5). */
export function decodePolyline(str: string): LatLng[] {
  const pts: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let result = 0, shift = 0, byte = 0x20;
      while (byte >= 0x20) {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      }
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (which === 0) lat += delta; else lng += delta;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

/** Distancias acumuladas (km) ao longo de uma linha. */
export function cumulativeKm(line: LatLng[]): number[] {
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + haversineKm(line[i - 1], line[i]));
  return acc;
}

/** Indice do vertice da linha mais proximo de p (busca a partir de hintIdx, janela adaptativa). */
export function nearestVertex(line: LatLng[], p: LatLng, hintIdx = 0): { idx: number; distKm: number } {
  let best = -1, bestD = Infinity;
  const from = Math.max(0, hintIdx - 40);
  const to = Math.min(line.length, hintIdx + 220);
  for (let i = from; i < to; i++) {
    const d = haversineKm(line[i], p);
    if (d < bestD) { bestD = d; best = i; }
  }
  // fallback global se a janela nao encontrou nada plausivel
  if (bestD > 1.5) {
    for (let i = 0; i < line.length; i++) {
      const d = haversineKm(line[i], p);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return { idx: best, distKm: bestD };
}

/** Ponto da linha a `aheadKm` a frente do indice dado (para a camera antecipar). */
export function pointAhead(line: LatLng[], acc: number[], idx: number, aheadKm: number): LatLng {
  const target = acc[idx] + aheadKm;
  for (let i = idx; i < line.length; i++) if (acc[i] >= target) return line[i];
  return line[line.length - 1];
}

export function formatDistance(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km';
  return Math.round(m / 10) * 10 + ' m';
}

export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
}
