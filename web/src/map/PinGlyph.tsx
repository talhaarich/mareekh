import type { PinType } from '../state/pins'

/**
 * A pin's symbol. Shape tells the types apart (triangle = hazard, square = sample, star = feature),
 * so it still reads for colour-blind users and on a washed-out screen outside.
 */
export default function PinGlyph({ type, size = 20 }: { type: PinType; size?: number }) {
  const common = { strokeWidth: 1.5, strokeLinejoin: 'round' as const, className: 'stroke-bg' }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="block drop-shadow">
      {type === 'hazard' && (
        <>
          <path d="M12 2.5 L22.5 21 H1.5 Z" {...common} className="fill-pin-hazard stroke-bg" />
          <path d="M12 9 V14.5 M12 17.2 V17.6" strokeWidth={2.4} strokeLinecap="round" className="stroke-bg" />
        </>
      )}
      {type === 'sample' && (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" {...common} className="fill-pin-sample stroke-bg" />
          <circle cx="12" cy="12" r="3" className="fill-bg" />
        </>
      )}
      {type === 'feature' && (
        <path
          d="M12 2 L14.9 8.6 L22 9.2 L16.6 13.9 L18.2 21 L12 17.3 L5.8 21 L7.4 13.9 L2 9.2 L9.1 8.6 Z"
          {...common}
          className="fill-pin-feature stroke-bg"
        />
      )}
    </svg>
  )
}
