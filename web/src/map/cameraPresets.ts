/**
 * Camera views for 3D. Display choices: where to look from, not data.
 * Bearing is the direction the camera faces, clockwise from north.
 */
export type CameraPreset = 'delta' | 'crater'

export const CAMERA_PRESETS: Record<CameraPreset, { center: [number, number]; zoom: number; pitch: number; bearing: number }> = {
  // From the crater floor east of the walk, looking west-north-west at the delta front and the route.
  delta: { center: [77.428, 18.452], zoom: 13.2, pitch: 70, bearing: -65 },
  // The whole crater with its rim, from the south-east.
  crater: { center: [77.55, 18.4], zoom: 10.4, pitch: 58, bearing: -25 },
}

/**
 * Ground view ("Stand here"). Display settings, not physics: they frame the simulated view and are not
 * measurements of anything. Heights and distances are Mars metres (converted for MapLibre in groundScale.ts).
 */
/** Eye height above the ground at the start: high enough to see past the 20 m height cells nearby. */
export const GROUND_EYE_HEIGHT_M = 40
/** The mouse wheel changes the eye height within this range. */
export const GROUND_EYE_MIN_M = 10
export const GROUND_EYE_MAX_M = 200
/** Pitch on arrival: just below the horizon (90 is level). */
export const GROUND_PITCH_DEG = 84
/** Looking around is kept between nearly straight down and well above the horizon. */
export const GROUND_PITCH_MIN_DEG = 20
export const GROUND_PITCH_MAX_DEG = 135
/** Degrees the view turns per pixel dragged. */
export const GROUND_DRAG_DEG_PER_PX = 0.2
/** The flight in: duration, pitch while crossing, and the height kept above the highest ground on the way. */
export const GROUND_FLIGHT_MS = 3000
export const GROUND_CRUISE_PITCH_DEG = 70
export const GROUND_FLIGHT_CLEARANCE_M = 60
