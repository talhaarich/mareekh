/**
 * Small checks used where JSON enters the app. Each throws with the file and field name,
 * so a data file that breaks its contract (docs/specs/CONTRACTS.md) fails loudly at load time.
 */

export type JsonObject = Record<string, unknown>

export function asObject(value: unknown, where: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected an object`)
  }
  return value as JsonObject
}

export function asArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected a list`)
  return value
}

export function num(o: JsonObject, key: string, where: string): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${where}: "${key}" must be a number`)
  }
  return v
}

export function int(o: JsonObject, key: string, where: string): number {
  const v = num(o, key, where)
  if (!Number.isInteger(v)) throw new Error(`${where}: "${key}" must be a whole number`)
  return v
}

export function str(o: JsonObject, key: string, where: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new Error(`${where}: "${key}" must be a string`)
  return v
}

export function oneOf<T extends string>(o: JsonObject, key: string, allowed: readonly T[], where: string): T {
  const v = str(o, key, where)
  if (!(allowed as readonly string[]).includes(v)) {
    throw new Error(`${where}: "${key}" must be one of ${allowed.join(', ')}, got "${v}"`)
  }
  return v as T
}

/** `[south, west, north, east]` in degrees, with south < north and west < east. */
export function bounds(o: JsonObject, key: string, where: string): [number, number, number, number] {
  const arr = asArray(o[key], `${where}.${key}`)
  if (arr.length !== 4 || !arr.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new Error(`${where}: "${key}" must be [south, west, north, east]`)
  }
  const [s, w, n, e] = arr as number[]
  if (!(s < n && w < e)) throw new Error(`${where}: "${key}" must have south < north and west < east`)
  return [s, w, n, e]
}

/** Reads a fetch response as JSON, throwing with the file name on an HTTP error. */
export async function readJson(res: Response, fileName: string): Promise<unknown> {
  if (!res.ok) throw new Error(`${fileName}: HTTP ${res.status}`)
  return res.json()
}
