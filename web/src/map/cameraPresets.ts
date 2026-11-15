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
