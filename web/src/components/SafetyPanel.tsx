import { useData, type Assumption } from '../state/data'
import { usePlan } from '../state/plan'
import { Fact } from './Fact'
import { DASH, fmtAssumption, fmtDose, fmtPressureMbar, fmtTau, fmtTempC } from './format'

function findAssumption(assumptions: Assumption[], key: string): Assumption | undefined {
  return assumptions.find((a) => a.key === key)
}

function sourceOf(a: Assumption | undefined): string {
  if (!a) return 'Missing from assumptions.json'
  return `${a.kind === 'team' ? 'Team assumption' : 'Published'}: ${a.source}`
}

/**
 * Radiation, dust and weather for the walk. No status colours here: the specs give no threshold rule
 * for dose, dust or weather, so nothing is marked as good or bad.
 */
export default function SafetyPanel() {
  const loaded = useData((s) => s.loaded)
  const assumptions = useData((s) => s.assumptions)
  const conditions = useData((s) => s.conditions)
  const result = usePlan((s) => s.result)

  if (!loaded || !conditions) {
    return (
      <section aria-label="Safety" className="space-y-2">
        <p className="text-sm text-fg-muted">Loading conditions…</p>
      </section>
    )
  }

  const rate = findAssumption(assumptions, 'dose_rate_msv_h')
  const tauNormal = findAssumption(assumptions, 'tau_normal')
  const tauStorm = findAssumption(assumptions, 'tau_storm')

  return (
    <section aria-label="Safety" className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg">Radiation</h3>
        <Fact
          label="Dose for this walk"
          value={result ? fmtDose(result.doseMSv) : DASH}
          source={result ? 'Route model: total walk time, stations included, × the dose rate below' : 'No plan yet'}
        />
        <Fact label="Dose rate" value={rate ? fmtAssumption(rate.value, rate.unit) : DASH} source={sourceOf(rate)} />
        <p className="text-[11px] leading-snug text-fg">
          This rate was measured by Curiosity in Gale crater and is applied to Jezero. There is no Jezero
          surface measurement.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg">Dust</h3>
        <Fact label="Optical depth (no unit)" value={fmtTau(conditions.tau)} source={`Conditions file, sol ${conditions.sol}: source below`} />
        <Fact label="Normal reference" value={tauNormal ? fmtTau(tauNormal.value) : DASH} source={sourceOf(tauNormal)} />
        <Fact label="Storm reference" value={tauStorm ? fmtTau(tauStorm.value) : DASH} source={sourceOf(tauStorm)} />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-fg">Weather, sol {conditions.sol}</h3>
        <Fact label="Air temperature" value={fmtTempC(conditions.airTempK)} source={`Conditions file, sol ${conditions.sol}: source below`} />
        <Fact label="Air pressure" value={fmtPressureMbar(conditions.pressurePa)} source={`Conditions file, sol ${conditions.sol}: source below`} />
        <p className="text-[10px] leading-tight text-fg-muted">
          Source: {conditions.source}. {conditions.caveat}
        </p>
      </div>
    </section>
  )
}
