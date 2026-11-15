/**
 * Every number the ground scene uses, each marked as one of:
 * - DATA: comes from a data file (named), never typed here.
 * - TEAM ASSUMPTION: our choice about Mars, like the entries in assumptions.json; say so on screen.
 * - ILLUSTRATIVE: how the picture is drawn (detail, size, colour mix). Not a claim about Mars.
 * Physical constants (walking speed, slope limits, Mars radius, tau) are DATA: read from
 * assumptions.json and conditions.json at run time, not here.
 */

// ---------- Terrain ----------

/** ILLUSTRATIVE. Side of the square patch drawn around the point, metres (clipped to the height grid). */
export const PATCH_SIZE_M = 4000
/** ILLUSTRATIVE. Finest mesh spacing near the viewer, metres; heights between the 20 m grid points are bicubic. */
export const FINE_SPACING_M = 2.5
/** ILLUSTRATIVE. Largest small-bump height added between grid points, metres. Zero at every grid point. */
export const NOISE_MAX_M = 1
/** ILLUSTRATIVE. Wavelength of the coarsest bump octave, metres; each further octave halves it. */
export const NOISE_WAVELENGTH_M = 12
/** ILLUSTRATIVE. Bump octaves. */
export const NOISE_OCTAVES = 4
/** ILLUSTRATIVE. Seed for bumps and rocks: the same place always looks the same. */
export const WORLD_SEED = 2026
/**
 * ILLUSTRATIVE. Bumps fade to zero over this distance around each grid point, metres, so every measured
 * height stays exact.
 */
export const NOISE_CLEAR_M = 4
/** ILLUSTRATIVE. The patch fades into haze between these distances from its centre, metres. */
export const EDGE_FADE_START_M = 1500
export const EDGE_FADE_END_M = 1950
/** ILLUSTRATIVE. Terrain is built in square chunks of this size, metres. */
export const CHUNK_SIZE_M = 250
/**
 * ILLUSTRATIVE. Level of detail: mesh spacing (metres) for chunks whose nearest edge is within the
 * distance (metres, times the quality's LOD factor). Beyond the last: the coarsest spacing.
 */
export const LOD_LEVELS: { spacingM: number; withinM: number }[] = [
  { spacingM: FINE_SPACING_M, withinM: 260 },
  { spacingM: 5, withinM: 600 },
  { spacingM: 10, withinM: 1200 },
  { spacingM: 20, withinM: Infinity },
]
/** ILLUSTRATIVE. Skirt depth below chunk edges (hides cracks between detail levels), in mesh spacings. */
export const SKIRT_SPACINGS = 3
/** ILLUSTRATIVE. Close-up regolith texture: tile size in metres, and where it fades out (metres from the eye). */
export const DETAIL_TILE_M = 3
export const DETAIL_FADE_START_M = 25
export const DETAIL_FADE_END_M = 140

// ---------- Rocks ----------

/**
 * TEAM ASSUMPTION. Rock abundance: fraction of the ground covered by rocks, k. The size curve is the
 * exponential model F(D) = k·exp(-q·D), q = Q0 + Q1 / k, in the form used by Golombek and Rapp (1997)
 * for Mars landing sites. The values are our assumption for a rocky crater floor, not a measurement
 * here: real rocks this small cannot be seen from orbit.
 */
export const ROCK_ABUNDANCE_K = 0.05
export const ROCK_Q0 = 1.79
export const ROCK_Q1 = 0.152
/** ILLUSTRATIVE. Smallest and largest rock drawn (diameter, metres). */
export const ROCK_MIN_D_M = 0.15
export const ROCK_MAX_D_M = 2
/** ILLUSTRATIVE. Rocks are flattened to this height-to-width range and sunk this fraction of their height. */
export const ROCK_SQUASH_MIN = 0.45
export const ROCK_SQUASH_MAX = 0.8
export const ROCK_SINK = 0.25
/** ILLUSTRATIVE. Rock shapes (instanced meshes). */
export const ROCK_VARIANTS = 4

// ---------- Sky, light, haze ----------

/** ILLUSTRATIVE. Haze: fog density per metre for each unit of dust optical depth tau (tau is DATA). */
export const FOG_DENSITY_PER_TAU = 0.00022
/** ILLUSTRATIVE. Local time when the view opens, hours (the slider runs 06:00 to 18:00). */
export const START_LOCAL_HOUR = 10
export const LOCAL_HOUR_MIN = 6
export const LOCAL_HOUR_MAX = 18
/**
 * ILLUSTRATIVE. Sun declination, degrees. The walk has no date, so the season is not modelled: the sun
 * moves as at an equinox. With the latitude (DATA) this gives an approximate sun direction.
 */
export const SUN_DECLINATION_DEG = 0
/** ILLUSTRATIVE. Light strengths. */
export const SUN_INTENSITY = 2.4
export const SKY_LIGHT_INTENSITY = 0.9

// ---------- You ----------

/** TEAM ASSUMPTION. Eye height of a suited crew member standing, metres. */
export const EYE_HEIGHT_M = 1.7
/** ILLUSTRATIVE. "Fast travel" multiplier on the walking speed (walk_speed_long_ms, DATA). */
export const FAST_TRAVEL = 5
/** ILLUSTRATIVE. Degrees the view turns per pixel dragged; pitch limits, degrees from level. */
export const LOOK_DEG_PER_PX = 0.2
export const PITCH_MIN_DEG = -80
export const PITCH_MAX_DEG = 80
/** ILLUSTRATIVE. Camera field of view (vertical, degrees) and near/far planes (metres). */
export const FOV_DEG = 60
export const NEAR_M = 0.1
export const FAR_M = 6000
/** ILLUSTRATIVE. You stay this far inside the patch and the grid, metres. */
export const EDGE_MARGIN_M = 10
/** ILLUSTRATIVE. The view fades in over this long when it opens, milliseconds. */
export const FADE_IN_MS = 450
/** ILLUSTRATIVE. Within this distance of a station you are "at" it (its rover photo shows), metres. */
export const AT_STATION_M = 30

// ---------- From the planner ----------

/** ILLUSTRATIVE. Route ribbon width, lift above the ground and sample spacing, metres. */
export const ROUTE_WIDTH_M = 1
export const ROUTE_LIFT_M = 0.25
export const ROUTE_STEP_M = 2.5
/** ILLUSTRATIVE. Station beacons: height and radius, metres; label size (fraction of screen height). */
export const BEACON_HEIGHT_M = 45
export const BEACON_RADIUS_M = 0.7
export const BEACON_LABEL_SCREEN = 0.035
/** ILLUSTRATIVE. Labels are staggered over this many rows so stations in the same direction stay readable. */
export const BEACON_LABEL_ROWS = 3

// ---------- Quality ----------

/**
 * ILLUSTRATIVE. Detail levels, best first. Frame time is watched; detail drops when frames are slow and
 * rises again when there is time to spare.
 */
export const QUALITY_LEVELS: { name: string; pixelRatio: number; lodFactor: number; rockRadiusM: number }[] = [
  { name: 'high', pixelRatio: 2, lodFactor: 1, rockRadiusM: 140 },
  { name: 'medium', pixelRatio: 1.25, lodFactor: 0.7, rockRadiusM: 90 },
  { name: 'low', pixelRatio: 1, lodFactor: 0.45, rockRadiusM: 50 },
]
/** ILLUSTRATIVE. Target 60 fps: drop detail when frames average over SLOW_FRAME_MS, raise it when they stay under FAST_FRAME_MS (a 60 Hz screen gives 16.7 ms). */
export const SLOW_FRAME_MS = 22
export const FAST_FRAME_MS = 18
/** ILLUSTRATIVE. Seconds of frames averaged before changing detail (raising waits longer). */
export const QUALITY_WINDOW_S = 2
export const QUALITY_RAISE_AFTER_S = 8
/** ILLUSTRATIVE. After lowering detail, wait this long before trying higher detail again (no flicker between levels). */
export const QUALITY_RAISE_COOLDOWN_S = 20
