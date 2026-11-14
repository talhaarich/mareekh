import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseAssumptions } from '../state/data'
import { blockedMask, NEIGHBOURS, neighbourIndex, speedModelFromAssumptions, stepTimeS, vmaxFromAssumptions, walkSpeedMs } from './cost'
import { cellIndex, loadGrid, type FetchFile } from './grid'

const examples = new URL('../../../examples/data/', import.meta.url)
const fromDisk: FetchFile = async (name) => new Response(await readFile(new URL(`tiny/${name}`, examples)))

const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
const vmax = vmaxFromAssumptions(assumptions)

const model = speedModelFromAssumptions(assumptions)

const tiny = await loadGrid(fromDisk) // height = 2 m per column going east, flat north-south, slope 5.7106 deg everywhere
const { meta } = tiny
const at = (r: number, c: number) => cellIndex(meta, r, c)

describe('speed model', () => {
  it('comes entirely from assumptions.json: long-walk speed and the Tobler curve shape', () => {
    expect(vmax).toBe(0.75)
    expect(model).toEqual({ vmaxMs: 0.75, decay: 3.5, optimumGrade: -0.05 })
  })

  it('fails loudly if a shape key is missing, instead of falling back to a default', () => {
    const without = assumptions.filter((a) => a.key !== 'speed_decay_per_grade')
    expect(() => speedModelFromAssumptions(without)).toThrow('no entry for "speed_decay_per_grade"')
  })
})

describe('walkSpeedMs', () => {
  it('is exactly vmax on flat ground', () => {
    expect(walkSpeedMs(0, model)).toBeCloseTo(vmax, 12)
  })

  it('is fastest on a slight downhill', () => {
    const peak = walkSpeedMs(-0.05, model)
    expect(peak).toBeCloseTo(vmax * Math.exp(0.175), 12)
    for (const g of [-0.3, -0.1, -0.06, -0.04, 0, 0.1, 0.3]) expect(walkSpeedMs(g, model)).toBeLessThan(peak)
  })

  it('falls fast on steep grades, and uphill is slower than the same downhill', () => {
    expect(walkSpeedMs(0.27, model)).toBeLessThan(vmax / 2) // about 15 degrees up
    expect(walkSpeedMs(0.2, model)).toBeLessThan(walkSpeedMs(-0.2, model))
  })
})

describe('blockedMask', () => {
  it('blocks every cell when the limit is under the slope, none when over', () => {
    expect(blockedMask(tiny, 5).every((b) => b === 1)).toBe(true)
    expect(blockedMask(tiny, 15).every((b) => b === 0)).toBe(true)
  })

  it('leaves a cell exactly at the limit open', () => {
    expect(blockedMask(tiny, tiny.slope[0])[0]).toBe(0)
  })

  it('blocks no-data cells in either grid', () => {
    const holed = { ...tiny, dem: tiny.dem.slice(), slope: tiny.slope.slice() }
    holed.dem[at(1, 1)] = meta.nodata
    holed.slope[at(2, 2)] = meta.nodata
    const b = blockedMask(holed, 15)
    expect([b[at(1, 1)], b[at(2, 2)], b[at(3, 3)]]).toEqual([1, 1, 0])
  })
})

describe('stepTimeS on the tiny grid', () => {
  const open = blockedMask(tiny, 15)
  const res = meta.resM

  it('walks flat north-south at vmax', () => {
    expect(stepTimeS(tiny, open, model, at(2, 3), at(1, 3), res)).toBeCloseTo(res / vmax, 9)
  })

  it('takes longer uphill (east) than downhill (west)', () => {
    const up = stepTimeS(tiny, open, model, at(2, 3), at(2, 4), res) // +2 m over 20 m: grade +0.1
    const down = stepTimeS(tiny, open, model, at(2, 4), at(2, 3), res) // grade -0.1
    const length = Math.hypot(res, 2)
    expect(up).toBeCloseTo(length / (vmax * Math.exp(-3.5 * 0.1)), 9)
    expect(down).toBeCloseTo(length / vmax, 9) // |-0.1 + 0.05| - 0.05 = 0
    expect(up).toBeGreaterThan(down)
  })

  it('uses the diagonal flat distance for diagonal steps', () => {
    const flat = res * Math.SQRT2
    const t = stepTimeS(tiny, open, model, at(2, 3), at(1, 4), flat) // +2 m over 28.3 m
    expect(t).toBeCloseTo(Math.hypot(flat, 2) / walkSpeedMs(2 / flat, model), 9)
  })

  it('is Infinity into a blocked cell', () => {
    expect(stepTimeS(tiny, blockedMask(tiny, 5), model, at(2, 3), at(1, 3), res)).toBe(Infinity)
  })
})

describe('neighbours', () => {
  it('has 4 side neighbours at res_m and 4 diagonals at res_m * sqrt 2', () => {
    expect(NEIGHBOURS.filter((n) => n.flatFactor === 1)).toHaveLength(4)
    expect(NEIGHBOURS.filter((n) => n.flatFactor === Math.SQRT2)).toHaveLength(4)
    expect(meta.resM * Math.SQRT2).toBeCloseTo(28.3, 1)
  })

  it('gives -1 off the grid: a corner cell has 3 neighbours, a middle cell 8', () => {
    const count = (r: number, c: number) => NEIGHBOURS.filter((_, k) => neighbourIndex(meta, r, c, k) >= 0).length
    expect(count(0, 0)).toBe(3)
    expect(count(meta.height - 1, meta.width - 1)).toBe(3)
    expect(count(2, 3)).toBe(8)
  })
})
