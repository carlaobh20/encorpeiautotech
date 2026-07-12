/**
 * SampleBuffer — memoria curta da viagem para os graficos do sheet expandido.
 * Buffer circular leve (sem libs), amostrado a cada tick de VehicleData.
 */

export interface Sample {
  t: number;
  soc: number | null;
  powerKw: number | null;
  consumptionKwh100: number | null;
  batteryTempC: number | null;
  speedKmh: number | null;
}

const MAX = 360; // ~3 min a 2 Hz, ou 30 min a 1 amostra/5s

export class SampleBuffer {
  private buf: Sample[] = [];
  private lastPush = 0;
  minIntervalMs = 2000;

  push(s: Sample) {
    if (s.t - this.lastPush < this.minIntervalMs) return;
    this.lastPush = s.t;
    this.buf.push(s);
    if (this.buf.length > MAX) this.buf.shift();
  }

  all(): Sample[] { return this.buf; }
  clear() { this.buf = []; this.lastPush = 0; }

  /** Serie numerica pronta para sparkline (nulls interpolados por vizinho). */
  series(key: keyof Omit<Sample, 't'>): number[] {
    const out: number[] = [];
    let last = 0;
    for (const s of this.buf) {
      const v = s[key];
      if (v !== null && v !== undefined) last = v as number;
      out.push(last);
    }
    return out;
  }
}

export const sampleBuffer = new SampleBuffer();

/** Sparkline SVG path (0..w x 0..h), sem dependencias. */
export function sparkPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => (i === 0 ? 'M' : 'L') + (i * step).toFixed(1) + ' ' + (h - ((v - min) / span) * h).toFixed(1))
    .join(' ');
}
