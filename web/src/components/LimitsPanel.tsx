import type { ReactNode } from 'react'
import { useData } from '../state/data'
import { fmtAssumption } from './format'

function Item({ children }: { children: ReactNode }) {
  return <li className="pl-1 text-[11px] leading-[15px] text-fg-muted marker:text-fg-muted">{children}</li>
}

/**
 * What this tool cannot tell you. Built from the loaded files wherever possible, so no number here is
 * typed by hand: cell size from grid.json, values from assumptions.json, the sol from conditions.json.
 */
export default function LimitsPanel() {
  const grid = useData((s) => s.grid)
  const gridError = useData((s) => s.gridError)
  const assumptions = useData((s) => s.assumptions)
  const conditions = useData((s) => s.conditions)
  const manifest = useData((s) => s.manifest)

  const drift = assumptions.find((a) => a.key === 'drift_fraction')
  const team = assumptions.filter((a) => a.kind === 'team')
  const caveats = (manifest?.layers ?? []).filter((l) => l.caveat !== '')

  return (
    <section aria-label="Honest limits" className="space-y-2">
      <ul className="list-disc space-y-1.5 pl-4">
        <Item>
          {grid ? (
            <>
              Map cells are {grid.meta.resM} m across (grid.json), so rocks and boulders are not visible. Slope
              from the height grid stands in for them.
            </>
          ) : (
            <>
              The height grid has not loaded{gridError ? ` (${gridError})` : ''}. When it does, its cells are too
              coarse to show rocks and boulders; slope from the grid stands in for them.
            </>
          )}
        </Item>
        <Item>The radiation figure is from Gale crater (Curiosity), not Jezero.</Item>
        <Item>
          The position is simulated, not measured. Its uncertainty grows by drift_fraction ={' '}
          {drift ? fmtAssumption(drift.value, drift.unit) : 'missing'} × distance walked since the last fix, a
          team placeholder.
        </Item>
        {conditions && (
          <Item>
            Conditions come from one sol (sol {conditions.sol}) and are not a forecast. Tau is not measured by
            MEDA.
          </Item>
        )}
        {team.length > 0 && (
          <Item>
            Team assumptions, no published source:
            <ul className="mt-0.5">
              {team.map((a) => (
                <li key={a.key} className="flex justify-between gap-2 leading-[15px]">
                  <span className="font-mono text-[10.5px]">{a.key}</span>
                  <span className="font-mono text-[10.5px] text-fg">{fmtAssumption(a.value, a.unit)}</span>
                </li>
              ))}
            </ul>
          </Item>
        )}
        {caveats.length > 0 && (
          <Item>
            Map layers: {caveats.map((l) => `${l.name}: ${l.caveat.replace(/\.$/, '')}`).join('. ')}.
          </Item>
        )}
        <Item>For planning and rehearsal only. Not mission-critical software.</Item>
      </ul>
    </section>
  )
}
