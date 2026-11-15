/**
 * Every number the ground scene uses, each marked as one of:
 * - DATA: comes from a data file (named), never typed here.
 * - TEAM ASSUMPTION: our choice about Mars, like the entries in assumptions.json; say so on screen.
 * - ILLUSTRATIVE: how the picture is drawn (detail, size, colour mix). Not a claim about Mars.
 * Physical constants (walking speed, slope limits, Mars radius, tau) are DATA: read from
 * assumptions.json and conditions.json at run time, not here.
 */

// ---------- Terrain ----------

/**
 * ILLUSTRATIVE. Side of the square patch drawn around the point, metres (clipped to the height grid).
 * 6 km, so the delta scarp and crater rims about 2 km away stand clear of the fade at the edge.
 */
export const PATCH_SIZE_M = 6000
/** ILLUSTRATIVE. Finest mesh spacing near the viewer, metres; heights between the 20 m grid points are bicubic. */
export const FINE_SPACING_M = 2.5
/**
 * ILLUSTRATIVE. Tension of the bicubic between grid points: 0 is Catmull-Rom; 0.5 rounds rims and scarps
 * off less. Every measured grid height stays exact whatever the tension.
 */
export const HEIGHT_TENSION = 0.5
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
export const EDGE_FADE_START_M = 2500
export const EDGE_FADE_END_M = 2950
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
// ---------- Ground picture ----------

/**
 * ILLUSTRATIVE. Ground colour. The orbital photo is greyscale, so it only varies a regolith colour:
 * colour = regolith x (COLOUR_BASE + COLOUR_GAIN x value), value being the photo's blurred brightness
 * stretched between its PHOTO_STRETCH_LO and _HI percentiles. The regolith is the dusty-brown token
 * lightened REGOLITH_LIGHTEN toward light tan: butterscotch, like the Mastcam-Z station photos.
 */
export const REGOLITH_LIGHTEN = 0.3
export const PHOTO_STRETCH_LO = 0.02
export const PHOTO_STRETCH_HI = 0.98
export const COLOUR_BASE = 0.7
export const COLOUR_GAIN = 0.6
/**
 * ILLUSTRATIVE. Normal map from the photo's high-pass brightness (lighting only, never heights or slopes):
 * blur radius of the high-pass (pixels of the 5 m photo) and how strongly brightness reads as slope.
 */
export const PHOTO_HIGHPASS_PX = 6
export const PHOTO_NORMAL_STRENGTH = 9
/** ILLUSTRATIVE. Radius over which the photo's roughness and brightness are averaged for rock density, pixels. */
export const PHOTO_AREA_PX = 4
/** ILLUSTRATIVE. Fine regolith grain under the photo: how much it varies the photo's colour (fraction). */
export const DETAIL_AMPLITUDE = 0.22
/** ILLUSTRATIVE. Close-up regolith texture: tile size in metres, and where it fades out (metres from the eye). */
export const DETAIL_TILE_M = 3
export const DETAIL_FADE_START_M = 25
export const DETAIL_FADE_END_M = 140

// ---------- Rocks ----------

/** ILLUSTRATIVE. Scales the number of rocks drawn from the curve below (0.5: about half). */
export const ROCK_COUNT_SCALE = 0.5
/** ILLUSTRATIVE. Rock density follows the photo's local contrast, between these multiples of the curve. */
export const ROCK_DENSITY_FLOOR = 0.3
export const ROCK_DENSITY_CAP = 2

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

/**
 * ILLUSTRATIVE. Haze: fog density per metre for each unit of dust optical depth tau (tau is DATA, from
 * conditions.json). This is a visual scale, not optics: real tau describes the whole atmosphere's column,
 * and taken at face value it would bury features 2 km away. Scaled so the delta scarp and crater rims
 * about 2 km away stay clearly visible at the default tau, while dustier days still look hazier.
 */
export const FOG_DENSITY_PER_TAU = 0.0001
/** ILLUSTRATIVE. Local time when the view opens, hours: 16:30, a low sun whose long shadows show the relief. */
export const START_LOCAL_HOUR = 16.5
export const LOCAL_HOUR_MIN = 6
export const LOCAL_HOUR_MAX = 18
/**
 * ILLUSTRATIVE. Sun declination, degrees. The walk has no date, so the season is not modelled: the sun
 * moves as at an equinox. With the latitude (DATA) this gives an approximate sun direction.
 */
export const SUN_DECLINATION_DEG = 0
/** ILLUSTRATIVE. Light strengths: the sun, and a sky light strong enough that shadows read brown. */
export const SUN_INTENSITY = 2.1
export const SKY_LIGHT_INTENSITY = 0.85
/** ILLUSTRATIVE. Exposure for the filmic tone mapping (brightness of the lit scene). */
export const EXPOSURE = 1.1
/** ILLUSTRATIVE. The sun casts shadows over a square this far each way around you, metres (~500 m across). */
export const SHADOW_RADIUS_M = 250

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
/**
 * ILLUSTRATIVE. Opening views: standing at these stations (by name, as in stations.json) you first face this
 * bearing instead of the next station. "Delta front, top of Hawksbill Gap" looks east over the scarp
 * (the demo shot; the steepest drop from there is south-east, about 135°).
 */
export const OPENING_VIEWS: Record<string, number> = {
  'Delta front, top of Hawksbill Gap': 90,
}
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
export const QUALITY_LEVELS: { name: string; pixelRatio: number; lodFactor: number; rockRadiusM: number; shadowMapPx: number }[] = [
  { name: 'high', pixelRatio: 2, lodFactor: 1, rockRadiusM: 140, shadowMapPx: 2048 },
  { name: 'medium', pixelRatio: 1.25, lodFactor: 0.7, rockRadiusM: 90, shadowMapPx: 1024 },
  { name: 'low', pixelRatio: 1, lodFactor: 0.45, rockRadiusM: 50, shadowMapPx: 512 },
]
/** ILLUSTRATIVE. Target 60 fps: drop detail when frames average over SLOW_FRAME_MS, raise it when they stay under FAST_FRAME_MS (a 60 Hz screen gives 16.7 ms). */
export const SLOW_FRAME_MS = 22
export const FAST_FRAME_MS = 18
/** ILLUSTRATIVE. Seconds of frames averaged before changing detail (raising waits longer). */
export const QUALITY_WINDOW_S = 2
export const QUALITY_RAISE_AFTER_S = 8
/** ILLUSTRATIVE. Frames in the first seconds after opening (shader compile, ground build) are not counted. */
export const QUALITY_WARMUP_S = 3
/** ILLUSTRATIVE. After lowering detail, wait this long before trying higher detail again (no flicker between levels). */
export const QUALITY_RAISE_COOLDOWN_S = 20
