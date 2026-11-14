/**
 * MapLibre paints on a canvas, so it cannot use CSS variables. Read the value from tokens.css at
 * runtime instead of typing a colour here. Names are the CSS variable, e.g. '--color-route'.
 */
export function readToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value === '' ? 'black' : value
}
