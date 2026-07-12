/**
 * Design System — Encorpei Auto.
 *
 * Fonte unica de verdade para cor, tipografia, espaco, raio, blur e movimento.
 * TS puro: os mesmos tokens alimentam o PWA hoje (via CSS variables injetadas
 * em runtime) e o app nativo amanha (via StyleSheet) — sem duplicacao.
 *
 * Regra: componentes NUNCA usam hex/px soltos. Sempre var(--token) no CSS
 * ou import daqui no TS.
 */

export const color = {
  // Fundos
  bg: '#0b0f14',            // grafite azulado profundo
  bgGlow: '#101823',
  surface: 'rgba(255,255,255,0.045)',     // vidro dos cards
  surfaceStrong: 'rgba(13,19,27,0.88)',   // vidro denso (sheet, overlays)
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // Texto
  text: '#e8edf2',
  textDim: '#8494a6',
  textFaint: '#5c6b7c',

  // Assinatura
  teal: '#3ddcc4',          // regeneracao / positivo / marca
  tealDeep: '#06281f',
  amber: '#ffb04a',         // consumo / potencia
  danger: '#ff6b6b',

  // Tons semanticos (insights, saude)
  good: '#3ddcc4',
  warn: '#ffb04a',
  critical: '#ff6b6b',
  info: '#7fb4ff',
} as const;

export const font = {
  data: "'Chakra Petch', system-ui, sans-serif",  // numeros grandes, displays
  body: "'IBM Plex Sans', system-ui, sans-serif", // texto corrido
  mono: "'IBM Plex Mono', monospace",             // labels tecnicos
} as const;

/** Escala de espacamento em px (multiplos de 4). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Raios de borda em px. */
export const radius = { sm: 10, md: 14, lg: 18, xl: 26, pill: 999 } as const;

/** Intensidade de blur (px) por camada. */
export const blur = { card: 14, sheet: 26 } as const;

/** Duracoes de animacao em ms. */
export const duration = { fast: 150, base: 300, slow: 600 } as const;

export type Tone = 'info' | 'good' | 'warn' | 'critical';

export const toneColor: Record<Tone, string> = {
  info: color.info,
  good: color.good,
  warn: color.warn,
  critical: color.critical,
};

/** Mapa token → CSS variable. Um lugar so; o CSS inteiro le daqui. */
export function cssVariables(): Record<string, string> {
  return {
    '--bg': color.bg,
    '--bg-glow': color.bgGlow,
    '--glass': color.surface,
    '--glass-strong': color.surfaceStrong,
    '--glass-border': color.border,
    '--glass-border-strong': color.borderStrong,
    '--text': color.text,
    '--text-dim': color.textDim,
    '--text-faint': color.textFaint,
    '--teal': color.teal,
    '--teal-deep': color.tealDeep,
    '--amber': color.amber,
    '--danger': color.danger,
    '--good': color.good,
    '--warn': color.warn,
    '--critical': color.critical,
    '--info': color.info,
    '--font-data': font.data,
    '--font-body': font.body,
    '--font-mono': font.mono,
    '--radius-sm': radius.sm + 'px',
    '--radius-md': radius.md + 'px',
    '--radius': radius.lg + 'px',
    '--radius-xl': radius.xl + 'px',
    '--blur-card': blur.card + 'px',
    '--blur-sheet': blur.sheet + 'px',
    '--dur-fast': duration.fast + 'ms',
    '--dur-base': duration.base + 'ms',
    '--dur-slow': duration.slow + 'ms',
  };
}

/** Injeta os tokens como CSS variables no documento (chamar antes do render). */
export function injectTokens(root?: HTMLElement) {
  if (typeof document === 'undefined') return; // ambiente nativo/teste: no-op
  const el = root ?? document.documentElement;
  const vars = cssVariables();
  for (const k of Object.keys(vars)) el.style.setProperty(k, vars[k]);
}
