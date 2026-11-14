import { beforeEach, describe, expect, it } from 'vitest'
import { useInteraction } from './interaction'
import { pinLabelText, pinTypeLabel } from './pinLabels'

describe('pin labels', () => {
  it('names the type alone when there is no note', () => {
    expect(pinLabelText({ type: 'hazard', note: '' })).toBe('Hazard')
    expect(pinLabelText({ type: 'sample', note: '   \n ' })).toBe('Sample')
  })

  it('adds the first line of the note', () => {
    expect(pinLabelText({ type: 'feature', note: 'Layered outcrop\nsecond line' })).toBe('Feature: Layered outcrop')
  })

  it('shortens long notes with an ellipsis', () => {
    const text = pinLabelText({ type: 'hazard', note: 'Loose sand on a steep slope, avoid at all costs' })
    expect(text.startsWith('Hazard: Loose sand on a steep')).toBe(true)
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual('Hazard: '.length + 24)
  })

  it('has a label for every type', () => {
    expect(['hazard', 'sample', 'feature'].map((t) => pinTypeLabel(t as 'hazard'))).toEqual(['Hazard', 'Sample', 'Feature'])
  })
})

describe('interaction: one card over the map at a time', () => {
  beforeEach(() => useInteraction.setState({ selectedStationId: null, editingPinId: null, pinDropType: null, flyTarget: null }))

  it('opening a pin editor closes the station card, and the other way round', () => {
    useInteraction.getState().selectStation('S1')
    useInteraction.getState().editPin('p1')
    expect(useInteraction.getState()).toMatchObject({ selectedStationId: null, editingPinId: 'p1' })
    useInteraction.getState().selectStation('S2')
    expect(useInteraction.getState()).toMatchObject({ selectedStationId: 'S2', editingPinId: null })
  })

  it('closing one card leaves the other alone', () => {
    useInteraction.getState().editPin('p1')
    useInteraction.getState().selectStation(null)
    expect(useInteraction.getState().editingPinId).toBe('p1')
  })

  it('flyTo changes seq every time, so the same place can be asked twice', () => {
    useInteraction.getState().flyTo({ lat: 1, lon: 2 })
    const a = useInteraction.getState().flyTarget
    useInteraction.getState().flyTo({ lat: 1, lon: 2 })
    expect(useInteraction.getState().flyTarget?.seq).toBe((a?.seq ?? 0) + 1)
  })
})
