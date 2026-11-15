/**
 * The three.js ground scene: terrain in chunks with levels of detail, illustrative rocks, sky, haze and
 * sun, the planned route and station beacons, walking and looking, automatic detail, and full disposal.
 * Axes: x east, y up, z south (metres from the patch centre on Mars).
 */

import * as THREE from 'three'
import type { Grid } from '../lib/grid'
import type { LatLon } from '../lib/mars'
import * as C from './constants'
import { normalMapRGBA, photoFields, rockDensityFactor, sampleField, type PhotoFields } from './photo'
import { mulberry32, rocksForCell, rockSizes, type Rock } from './rocks'
import { sunDirection } from './sun'
import { buildChunk, gridMap, makeFrame, slopeAt, terrainHeight, toLatLon, toLocal, type Frame, type GridMap, type NoiseOptions } from './terrain'

export interface SceneColors {
  skyHorizon: string
  skyZenith: string
  sunGlow: string
  regolith: string
  /** Rock colours: each rock sits between these two (grey-brown basalt), darker or lighter. */
  rockBrown: string
  rockGrey: string
  route: string
  base: string
  station: string
  labelText: string
  labelBack: string
}

export interface SceneInputs {
  container: HTMLElement
  grid: Grid
  marsRadiusM: number
  start: LatLon
  stations: { id: string; name: string; lat: number; lon: number }[]
  /** The planned route, one path per leg. */
  routes: LatLon[][]
  /** The satellite view picture and its edges in degrees, or null. */
  satellite: { url: string; west: number; south: number; east: number; north: number } | null
  /** Dust optical depth (conditions.json). */
  tau: number
  /** walk_speed_long_ms (assumptions.json). */
  walkSpeedMs: number
  /** slope_limit_hard_deg (assumptions.json): no rocks drawn on steeper cells. */
  hardSlopeDeg: number
  colors: SceneColors
  onHud: (hud: HudState) => void
}

export interface HudState {
  position: LatLon
  /** Degrees clockwise from north. */
  headingDeg: number
  eyeHeightM: number
  slopeDeg: number | null
  fast: boolean
  quality: string
  fps: number
  sunElevationDeg: number
  /** True until the first frame is drawn. */
  loading: boolean
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0],
  ArrowUp: [1, 0],
  KeyS: [-1, 0],
  ArrowDown: [-1, 0],
  KeyA: [0, -1],
  ArrowLeft: [0, -1],
  KeyD: [0, 1],
  ArrowRight: [0, 1],
}

/**
 * Additions to three's standard material for the ground: a fine regolith grain under the photo (close up
 * only) and the fade into haze at the patch edge. Lighting, shadows, fog and the photo stay three's own.
 */
function groundShader(material: THREE.MeshStandardMaterial, uniforms: Record<string, THREE.IUniform>): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMmWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMmWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vMmWorld;\nuniform sampler2D mmDetail;\nuniform float mmTile;\nuniform float mmDetailAmp;\nuniform float mmDetailNear;\nuniform float mmDetailFar;\nuniform float mmEdgeStart;\nuniform float mmEdgeEnd;',
      )
      .replace(
        '#include <map_fragment>',
        // The photo sets the colour; the grain only varies it a little, and only close up.
        '#include <map_fragment>\nfloat mmNear = 1.0 - smoothstep(mmDetailNear, mmDetailFar, distance(vMmWorld, cameraPosition));\ndiffuseColor.rgb *= 1.0 + (texture2D(mmDetail, vMmWorld.xz / mmTile).r - 0.5) * 2.0 * mmDetailAmp * mmNear;',
      )
      .replace(
        '#include <fog_fragment>',
        '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(mmEdgeStart, mmEdgeEnd, length(vMmWorld.xz)));',
      )
  }
}

/** White tinted `k` of the way toward `c` scaled to unit brightness, so the tint colours but does not darken. */
function tintTowards(c: THREE.Color, k: number): THREE.Color {
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  const unit = lum > 0 ? c.clone().multiplyScalar(1 / lum) : new THREE.Color(1, 1, 1)
  return new THREE.Color(1, 1, 1).lerp(unit, k)
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 sunDir;
uniform vec3 sunGlow;
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  float t = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(t, 0.6));
  float s = max(dot(dir, sunDir), 0.0);
  col += sunGlow * (pow(s, 800.0) * 3.0 + pow(s, 16.0) * 0.25);
  if (dir.y < 0.0) col = horizon;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

interface ChunkState {
  ci: number
  cj: number
  level: number
  mesh: THREE.Mesh
}

export class GroundSceneController {
  private readonly i: SceneInputs
  private readonly frame: Frame
  private readonly gmap: GridMap
  private readonly noise: NoiseOptions
  private readonly bounds: { minE: number; maxE: number; minN: number; maxN: number }
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly terrainMaterial: THREE.MeshStandardMaterial
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly sky: THREE.Mesh
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly chunks = new Map<string, ChunkState>()
  private readonly rockMeshes: THREE.InstancedMesh[] = []
  private readonly rockCache = new Map<number, Rock[]>()
  private readonly rockSizes = rockSizes(C.ROCK_ABUNDANCE_K, C.ROCK_Q0, C.ROCK_Q1, C.ROCK_MIN_D_M, C.ROCK_MAX_D_M)
  private readonly textures: THREE.Texture[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly keys = new Set<string>()
  private disposed = false
  private raf = 0
  private last = 0

  // Where you are and where you look.
  private e = 0
  private n = 0
  private yaw = 0 // radians, clockwise from north
  private pitch = 0 // radians, up positive
  private fast = false

  // Detail.
  private quality = 0
  private lodAt: { e: number; n: number } | null = null
  private rocksAt: { e: number; n: number } | null = null
  private frameTimes: number[] = []
  private windowStart = 0
  private quickSince = 0
  private lastDrop = -Infinity
  private fps = 0
  private hudAt = 0
  private drawn = false
  private sunElevationDeg = 0
  private openedAt = 0
  private readonly sunDir = new THREE.Vector3(0, 1, 0)
  /** Roughness and brightness from the photo (null until it has loaded): set rock density. */
  private photo: PhotoFields | null = null

  constructor(inputs: SceneInputs) {
    this.i = inputs
    const { grid } = inputs
    this.frame = makeFrame(inputs.start, inputs.marsRadiusM)
    this.gmap = gridMap(grid.meta, this.frame)
    this.noise = { maxM: C.NOISE_MAX_M, wavelengthM: C.NOISE_WAVELENGTH_M, octaves: C.NOISE_OCTAVES, clearM: C.NOISE_CLEAR_M, seed: C.WORLD_SEED }

    // The patch, clipped to the grid (cell edges are half a cell beyond the outer centres).
    const g = this.gmap
    const eAt = (fx: number) => (fx - g.fx0) / g.fxPerE
    const nAt = (fy: number) => (fy - g.fy0) / g.fyPerN
    const half = C.PATCH_SIZE_M / 2
    this.bounds = {
      minE: Math.max(-half, eAt(-0.5)),
      maxE: Math.min(half, eAt(grid.meta.width - 0.5)),
      minN: Math.max(-half, nAt(grid.meta.height - 0.5)),
      maxN: Math.min(half, nAt(-0.5)),
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, C.QUALITY_LEVELS[0].pixelRatio))
    this.renderer.setSize(inputs.container.clientWidth, inputs.container.clientHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // Filmic tone mapping: stronger contrast, and the photo's low albedo is not lost in the dark.
    // Route, beacons and labels opt out (toneMapped: false) so their colours stay exact.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = C.EXPOSURE
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    inputs.container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(C.FOV_DEG, inputs.container.clientWidth / Math.max(1, inputs.container.clientHeight), C.NEAR_M, C.FAR_M)
    this.camera.rotation.order = 'YXZ'

    const col = (c: string) => new THREE.Color(c)
    const fogDensity = C.FOG_DENSITY_PER_TAU * Math.max(0, inputs.tau)
    this.scene.fog = new THREE.FogExp2(col(inputs.colors.skyHorizon), fogDensity)

    // Sky dome, always centred on the camera.
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        horizon: { value: col(inputs.colors.skyHorizon) },
        zenith: { value: col(inputs.colors.skyZenith) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunGlow: { value: col(inputs.colors.sunGlow) },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(C.FAR_M * 0.9, 32, 16), this.skyMaterial)
    this.sky.renderOrder = -1
    this.sky.frustumCulled = false
    this.scene.add(this.sky)

    // One sun, casting shadows over a square around you (it follows you each frame), and a low sky light.
    this.sun = new THREE.DirectionalLight(col(inputs.colors.sunGlow), C.SUN_INTENSITY)
    this.sun.castShadow = true
    const sc = this.sun.shadow.camera
    sc.left = -C.SHADOW_RADIUS_M
    sc.right = C.SHADOW_RADIUS_M
    sc.top = C.SHADOW_RADIUS_M
    sc.bottom = -C.SHADOW_RADIUS_M
    sc.near = 1
    sc.far = 5000
    this.sun.shadow.mapSize.set(C.QUALITY_LEVELS[0].shadowMapPx, C.QUALITY_LEVELS[0].shadowMapPx)
    this.sun.shadow.bias = -0.001
    this.sun.shadow.normalBias = 1.2
    this.hemi = new THREE.HemisphereLight(col(inputs.colors.skyZenith), col(inputs.colors.regolith), C.SKY_LIGHT_INTENSITY)
    this.scene.add(this.sun, this.sun.target, this.hemi)

    // The ground: the 5 m orbital photo as its colour (tinted at most PHOTO_TINT toward regolith), its
    // high-pass as a normal map, three's lighting and shadows, the regolith grain underneath.
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      color: tintTowards(col(inputs.colors.regolith), C.PHOTO_TINT),
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    groundShader(this.terrainMaterial, {
      mmDetail: { value: this.detailTexture() },
      mmTile: { value: C.DETAIL_TILE_M },
      mmDetailAmp: { value: C.DETAIL_AMPLITUDE },
      mmDetailNear: { value: C.DETAIL_FADE_START_M },
      mmDetailFar: { value: C.DETAIL_FADE_END_M },
      mmEdgeStart: { value: C.EDGE_FADE_START_M },
      mmEdgeEnd: { value: C.EDGE_FADE_END_M },
    })
    this.loadSatellite()

    this.buildRockMeshes()
    this.buildRoute()
    this.buildBeacons()

    // Stand where asked (inside the patch and the grid).
    const p = toLocal(this.frame, inputs.start)
    this.moveTo(p.e, p.n)
    this.setLocalHour(C.START_LOCAL_HOUR)
    this.updateLod(true)
    this.updateRocks(true)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(inputs.container)
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown, true)
    window.addEventListener('keyup', this.onKeyUp, true)
    window.addEventListener('blur', this.onBlur)
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Face a bearing (degrees clockwise from north). */
  setHeading(deg: number): void {
    this.yaw = (deg * Math.PI) / 180
  }

  /** Sun direction from a local hour (approximate, see constants). */
  setLocalHour(hour: number): void {
    const s = sunDirection(hour, this.frame.lat0, C.SUN_DECLINATION_DEG)
    this.sunElevationDeg = s.elevationDeg
    this.sunDir.set(s.east, s.up, -s.north).normalize()
    this.skyMaterial.uniforms.sunDir.value.copy(this.sunDir)
    this.placeSun()
    // The sun fades out as it sets (illustrative); the sky light stays low for contrast.
    const k = THREE.MathUtils.smoothstep(s.elevationDeg, -2, 8)
    this.sun.intensity = C.SUN_INTENSITY * k
    this.hemi.intensity = C.SKY_LIGHT_INTENSITY * (0.6 + 0.4 * k)
  }

  /** The sun and its shadow box follow you. */
  private placeSun(): void {
    const at = this.camera.position
    this.sun.target.position.copy(at)
    this.sun.position.copy(at).addScaledVector(this.sunDir, 2000)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown, true)
    window.removeEventListener('keyup', this.onKeyUp, true)
    window.removeEventListener('blur', this.onBlur)
    const materials = new Set<THREE.Material>()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => materials.add(x))
      else if (mat) materials.add(mat)
      if (o instanceof THREE.InstancedMesh) o.dispose()
    })
    for (const m of materials) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
    for (const t of this.textures) t.dispose()
    this.sun.shadow.dispose()
    this.terrainMaterial.dispose()
    this.skyMaterial.dispose()
    this.chunks.clear()
    this.rockCache.clear()
    this.scene.clear()
    this.renderer.renderLists.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    el.remove()
  }

  // ---------- ground ----------

  private heightAt = (e: number, n: number): number => {
    const b = this.bounds
    const ce = Math.min(b.maxE, Math.max(b.minE, e))
    const cn = Math.min(b.maxN, Math.max(b.minN, n))
    const g = this.gmap
    return terrainHeight(this.i.grid, g.fx0 + ce * g.fxPerE, g.fy0 + cn * g.fyPerN, this.noise, C.HEIGHT_TENSION) ?? 0
  }

  /** Ground height anywhere on the grid (not clipped to the patch), for beacons beyond it. */
  private gridHeightAt(e: number, n: number): number {
    const g = this.gmap
    return terrainHeight(this.i.grid, g.fx0 + e * g.fxPerE, g.fy0 + n * g.fyPerN, this.noise, C.HEIGHT_TENSION) ?? 0
  }

  private uvAt = (e: number, n: number): [number, number] => {
    const s = this.i.satellite
    if (!s) return [0, 0]
    const p = toLatLon(this.frame, e, n)
    return [(p.lon - s.west) / (s.east - s.west), (p.lat - s.south) / (s.north - s.south)]
  }

  private loadSatellite(): void {
    const s = this.i.satellite
    if (!s) return
    new THREE.TextureLoader().load(
      s.url,
      (tex) => {
        if (this.disposed) {
          tex.dispose()
          return
        }
        // Full resolution, sharp at a glancing angle.
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
        this.textures.push(tex)
        this.terrainMaterial.map = tex
        this.usePhoto(tex.image as HTMLImageElement | ImageBitmap)
        this.terrainMaterial.needsUpdate = true
      },
      undefined,
      () => {
        // No picture: the ground keeps the plain regolith tint.
      },
    )
  }

  /**
   * From the photo's pixels: the normal map (lighting only) and the roughness and brightness that set rock
   * density. Rocks are re-placed once these are known.
   */
  private usePhoto(image: HTMLImageElement | ImageBitmap): void {
    const w = image.width
    const h = image.height
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx || w === 0 || h === 0) return
    ctx.drawImage(image, 0, 0)
    const px = ctx.getImageData(0, 0, w, h).data
    const lum = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255
    const fields = photoFields(lum, w, h, C.PHOTO_HIGHPASS_PX, C.PHOTO_AREA_PX)
    const normal = new THREE.DataTexture(normalMapRGBA(fields.highPass, w, h, C.PHOTO_NORMAL_STRENGTH), w, h)
    normal.wrapS = THREE.ClampToEdgeWrapping
    normal.wrapT = THREE.ClampToEdgeWrapping
    normal.minFilter = THREE.LinearMipmapLinearFilter
    normal.magFilter = THREE.LinearFilter
    normal.generateMipmaps = true
    normal.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    normal.needsUpdate = true
    this.textures.push(normal)
    this.terrainMaterial.normalMap = normal
    this.photo = fields
    this.rockCache.clear()
    this.updateRocks(true)
    // That took a long frame once; do not let it count as slow rendering.
    this.frameTimes = []
    this.windowStart = 0
  }

  /** Tiled close-up regolith grain (illustrative), generated, so nothing extra is downloaded. */
  private detailTexture(): THREE.DataTexture {
    const N = 128
    const rand = mulberry32(C.WORLD_SEED)
    const lattice = Array.from({ length: 16 * 16 }, () => rand())
    const data = new Uint8Array(N * N * 4)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let v = 0
        let amp = 0.5
        for (let o = 0; o < 3; o++) {
          const f = 4 << o
          const gx = (x / N) * f
          const gy = (y / N) * f
          const x0 = Math.floor(gx)
          const y0 = Math.floor(gy)
          const tx = gx - x0
          const ty = gy - y0
          const L = (i: number, j: number) => lattice[((j % f) * 16 + (i % f)) % lattice.length]
          const a = L(x0, y0) + (L(x0 + 1, y0) - L(x0, y0)) * tx
          const b = L(x0, y0 + 1) + (L(x0 + 1, y0 + 1) - L(x0, y0 + 1)) * tx
          v += amp * (a + (b - a) * ty)
          amp *= 0.5
        }
        const grain = rand() * 0.25
        const c = Math.round(255 * Math.min(1, Math.max(0, v * 0.85 + grain)))
        data.set([c, c, c, 255], (y * N + x) * 4)
      }
    }
    const tex = new THREE.DataTexture(data, N, N)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    this.textures.push(tex)
    return tex
  }

  /** Builds or rebuilds chunks for the current position and detail level. */
  private updateLod(all: boolean): void {
    const q = C.QUALITY_LEVELS[this.quality]
    const b = this.bounds
    const size = C.CHUNK_SIZE_M
    const wanted: { key: string; ci: number; cj: number; level: number; dist: number }[] = []
    for (let ci = Math.floor(b.minE / size); ci * size < b.maxE; ci++) {
      for (let cj = Math.floor(b.minN / size); cj * size < b.maxN; cj++) {
        const e0 = ci * size
        const n0 = cj * size
        const de = Math.max(e0 - this.e, 0, this.e - (e0 + size))
        const dn = Math.max(n0 - this.n, 0, this.n - (n0 + size))
        const dist = Math.hypot(de, dn)
        let level = C.LOD_LEVELS.length - 1
        for (let k = 0; k < C.LOD_LEVELS.length; k++) {
          if (dist < C.LOD_LEVELS[k].withinM * q.lodFactor) {
            level = k
            break
          }
        }
        wanted.push({ key: `${ci},${cj}`, ci, cj, level, dist })
      }
    }
    wanted.sort((x, y) => x.dist - y.dist)
    // Nearest first; while walking, at most a few rebuilds per frame keep the frame rate steady.
    let budget = all ? Infinity : 3
    for (const w of wanted) {
      const have = this.chunks.get(w.key)
      if (have && have.level === w.level) continue
      if (budget-- <= 0) {
        this.lodAt = null // finish next frame
        break
      }
      const spacing = C.LOD_LEVELS[w.level].spacingM
      const e0 = Math.max(b.minE, w.ci * size)
      const n0 = Math.max(b.minN, w.cj * size)
      const sizeM = Math.min(Math.min(b.maxE, (w.ci + 1) * size) - e0, Math.min(b.maxN, (w.cj + 1) * size) - n0)
      if (!(sizeM > 0)) continue
      const a = buildChunk({ e0, n0, sizeM, spacingM: spacing, skirtM: spacing * C.SKIRT_SPACINGS, heightAt: this.heightAt, uvAt: this.uvAt })
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(a.positions, 3))
      geom.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3))
      geom.setAttribute('uv', new THREE.BufferAttribute(a.uvs, 2))
      geom.setIndex(new THREE.BufferAttribute(a.indices, 1))
      geom.computeBoundingSphere()
      if (have) {
        have.mesh.geometry.dispose()
        have.mesh.geometry = geom
        have.level = w.level
      } else {
        const mesh = new THREE.Mesh(geom, this.terrainMaterial)
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.scene.add(mesh)
        this.chunks.set(w.key, { ci: w.ci, cj: w.cj, level: w.level, mesh })
      }
    }
  }

  // ---------- rocks ----------

  private buildRockMeshes(): void {
    // White base: each rock gets its own grey-brown through its instance colour.
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true })
    for (let v = 0; v < C.ROCK_VARIANTS; v++) {
      const rand = mulberry32(C.WORLD_SEED + 31 * v)
      const geom = new THREE.IcosahedronGeometry(0.5, v % 2)
      const pos = geom.getAttribute('position')
      // Same jitter for vertices at the same place, so the rock stays closed.
      const jitter = new Map<string, number>()
      for (let k = 0; k < pos.count; k++) {
        const key = `${pos.getX(k).toFixed(4)},${pos.getY(k).toFixed(4)},${pos.getZ(k).toFixed(4)}`
        if (!jitter.has(key)) jitter.set(key, 0.75 + rand() * 0.45)
        const f = jitter.get(key)!
        pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f, pos.getZ(k) * f)
      }
      geom.computeVertexNormals()
      const mesh = new THREE.InstancedMesh(geom, material, 1)
      mesh.frustumCulled = false
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.count = 0
      this.rockMeshes.push(mesh)
      this.scene.add(mesh)
    }
  }

  private updateRocks(force: boolean): void {
    if (!force && this.rocksAt && Math.hypot(this.e - this.rocksAt.e, this.n - this.rocksAt.n) < 8) return
    this.rocksAt = { e: this.e, n: this.n }
    const radius = C.QUALITY_LEVELS[this.quality].rockRadiusM
    const g = this.gmap
    const { grid } = this.i
    const { width, height } = grid.meta
    const area = g.cellE * g.cellN
    const fx = g.fx0 + this.e * g.fxPerE
    const fy = g.fy0 + this.n * g.fyPerN
    const spanC = Math.ceil(radius / g.cellE) + 1
    const spanR = Math.ceil(radius / g.cellN) + 1
    const perVariant: { m: THREE.Matrix4; c: THREE.Color }[][] = Array.from({ length: C.ROCK_VARIANTS }, () => [])
    const brown = new THREE.Color(this.i.colors.rockBrown)
    const grey = new THREE.Color(this.i.colors.rockGrey)
    const m = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const b = this.bounds
    for (let r = Math.max(0, Math.round(fy) - spanR); r <= Math.min(height - 1, Math.round(fy) + spanR); r++) {
      for (let c = Math.max(0, Math.round(fx) - spanC); c <= Math.min(width - 1, Math.round(fx) + spanC); c++) {
        const s = grid.slope[r * width + c]
        if (s === grid.meta.nodata || !Number.isFinite(s) || s > this.i.hardSlopeDeg) continue
        const key = r * width + c
        let rocks = this.rockCache.get(key)
        if (!rocks) {
          // Fewer rocks overall, and more where the photo looks rough or bright (illustrative).
          const [u, v] = this.uvAt((c - g.fx0) / g.fxPerE, (r - g.fy0) / g.fyPerN)
          const ph = this.photo
          const density = ph
            ? rockDensityFactor(sampleField(ph.rough, ph.width, ph.height, u, v), sampleField(ph.bright, ph.width, ph.height, u, v), ph.meanRough, ph.meanBright)
            : 1
          rocks = rocksForCell(r, c, area * density * C.ROCK_COUNT_SCALE, this.rockSizes, {
            worldSeed: C.WORLD_SEED,
            variants: C.ROCK_VARIANTS,
            squashMin: C.ROCK_SQUASH_MIN,
            squashMax: C.ROCK_SQUASH_MAX,
          })
          this.rockCache.set(key, rocks)
        }
        const ce = (c - g.fx0) / g.fxPerE
        const cn = (r - g.fy0) / g.fyPerN
        for (const rock of rocks) {
          const e = ce + rock.u * g.cellE
          const n = cn + rock.v * g.cellN
          if (e < b.minE || e > b.maxE || n < b.minN || n > b.maxN) continue
          if (Math.hypot(e - this.e, n - this.n) > radius) continue
          const h = rock.d * rock.squash
          pos.set(e, this.heightAt(e, n) + h * (0.5 - C.ROCK_SINK), -n)
          quat.setFromAxisAngle(up, rock.yaw)
          scale.set(rock.d, h, rock.d)
          // Grey-brown basalt: somewhere between the two shades, lighter or darker.
          const shade = 0.55 + 0.45 * ((rock.tone * 7.31) % 1)
          perVariant[rock.variant].push({ m: m.compose(pos, quat, scale).clone(), c: brown.clone().lerp(grey, rock.tone).multiplyScalar(shade) })
        }
      }
    }
    perVariant.forEach((list, v) => {
      let mesh = this.rockMeshes[v]
      if (list.length > mesh.instanceMatrix.count) {
        // Grow the instance buffer (rarely: only when the rock radius grows).
        const bigger = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.ceil(list.length * 1.5))
        bigger.frustumCulled = false
        bigger.castShadow = true
        bigger.receiveShadow = true
        this.scene.remove(mesh)
        mesh.dispose()
        this.scene.add(bigger)
        this.rockMeshes[v] = bigger
        mesh = bigger
      }
      list.forEach((x, k) => {
        mesh.setMatrixAt(k, x.m)
        mesh.setColorAt(k, x.c)
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  }

  // ---------- route and beacons ----------

  private inPatch(e: number, n: number): boolean {
    const b = this.bounds
    return e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN
  }

  private buildRoute(): void {
    const half = C.ROUTE_WIDTH_M / 2
    const positions: number[] = []
    const indices: number[] = []
    for (const path of this.i.routes) {
      const pts = path.map((p) => toLocal(this.frame, p))
      // Densify, keeping only points inside the patch; a gap starts a new strip.
      const dense: { e: number; n: number }[][] = [[]]
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1]
        const b = pts[k]
        const steps = Math.max(1, Math.ceil(Math.hypot(b.e - a.e, b.n - a.n) / C.ROUTE_STEP_M))
        for (let s = k === 1 ? 0 : 1; s <= steps; s++) {
          const e = a.e + ((b.e - a.e) * s) / steps
          const n = a.n + ((b.n - a.n) * s) / steps
          if (this.inPatch(e, n)) dense[dense.length - 1].push({ e, n })
          else if (dense[dense.length - 1].length > 0) dense.push([])
        }
      }
      for (const strip of dense) {
        if (strip.length < 2) continue
        const start = positions.length / 3
        strip.forEach((p, k) => {
          const prev = strip[Math.max(0, k - 1)]
          const next = strip[Math.min(strip.length - 1, k + 1)]
          const te = next.e - prev.e
          const tn = next.n - prev.n
          const len = Math.hypot(te, tn) || 1
          const le = (-tn / len) * half
          const ln = (te / len) * half
          for (const side of [1, -1]) {
            const e = p.e + side * le
            const n = p.n + side * ln
            positions.push(e, this.heightAt(e, n) + C.ROUTE_LIFT_M, -n)
          }
          if (k > 0) {
            const a = start + (k - 1) * 2
            indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
          }
        })
      }
    }
    if (positions.length === 0) return
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geom.setIndex(indices)
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false,
      color: new THREE.Color(this.i.colors.route),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.scene.add(new THREE.Mesh(geom, mat))
  }

  private buildBeacons(): void {
    const poleGeom = new THREE.CylinderGeometry(C.BEACON_RADIUS_M, C.BEACON_RADIUS_M, C.BEACON_HEIGHT_M, 12, 1, true)
    // Every station, also those beyond the patch: their beacons stand in the haze past its edge.
    this.i.stations.forEach((s, index) => {
      const p = toLocal(this.frame, s)
      if (Math.hypot(p.e, p.n) > C.FAR_M * 0.8) return
      const color = new THREE.Color(s.id === 'B' ? this.i.colors.base : this.i.colors.station)
      const ground = this.inPatch(p.e, p.n) ? this.heightAt(p.e, p.n) : this.gridHeightAt(p.e, p.n)
      const pole = new THREE.Mesh(poleGeom.clone(), new THREE.MeshBasicMaterial({ toneMapped: false, color, fog: false, transparent: true, opacity: 0.85 }))
      pole.position.set(p.e, ground + C.BEACON_HEIGHT_M / 2, -p.n)
      this.scene.add(pole)
      // A line up the pole stays one pixel wide however far away, so distant beacons do not vanish.
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.e, ground, -p.n), new THREE.Vector3(p.e, ground + C.BEACON_HEIGHT_M, -p.n)]),
        new THREE.LineBasicMaterial({ color, fog: false, toneMapped: false }),
      )
      this.scene.add(line)
      const label = this.labelSprite(`${s.id} · ${s.name}`, color)
      label.position.set(p.e, ground + C.BEACON_HEIGHT_M, -p.n)
      // Three rows of labels (in label heights above the pole), so stations in the same direction do not overlap.
      label.center.set(0.5, -(index % C.BEACON_LABEL_ROWS) * 1.2)
      this.scene.add(label)
    })
    poleGeom.dispose()
  }

  private labelSprite(text: string, accent: THREE.Color): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = '600 28px ui-monospace, monospace'
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + 24
    const h = 44
    canvas.width = w
    canvas.height = h
    ctx.font = font
    ctx.fillStyle = this.i.colors.labelBack
    ctx.globalAlpha = 0.85
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    ctx.fillStyle = `#${accent.getHexString()}`
    ctx.fillRect(0, 0, 6, h)
    ctx.fillStyle = this.i.colors.labelText
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 14, h / 2 + 1)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    // Drawn over everything, so a ridge never hides which way a station is.
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, fog: false, depthTest: false, toneMapped: false }))
    sprite.renderOrder = 10
    sprite.scale.set((C.BEACON_LABEL_SCREEN * w) / h, C.BEACON_LABEL_SCREEN, 1)
    sprite.center.set(0.5, 0)
    return sprite
  }

  // ---------- you ----------

  private moveTo(e: number, n: number): void {
    const b = this.bounds
    const m = C.EDGE_MARGIN_M
    this.e = Math.min(b.maxE - m, Math.max(b.minE + m, e))
    this.n = Math.min(b.maxN - m, Math.max(b.minN + m, n))
  }

  private dragging: { id: number; x: number; y: number } | null = null

  private onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return
    this.dragging = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }
    this.renderer.domElement.setPointerCapture(ev.pointerId)
  }

  private onPointerMove = (ev: PointerEvent) => {
    if (!this.dragging || ev.pointerId !== this.dragging.id) return
    const dx = ev.clientX - this.dragging.x
    const dy = ev.clientY - this.dragging.y
    this.dragging.x = ev.clientX
    this.dragging.y = ev.clientY
    const k = (C.LOOK_DEG_PER_PX * Math.PI) / 180
    // Grab the scene: drag right turns left, drag down looks up.
    this.yaw -= dx * k
    this.pitch = Math.min((C.PITCH_MAX_DEG * Math.PI) / 180, Math.max((C.PITCH_MIN_DEG * Math.PI) / 180, this.pitch + dy * k))
  }

  private onPointerUp = (ev: PointerEvent) => {
    if (this.dragging && ev.pointerId === this.dragging.id) this.dragging = null
  }

  /**
   * Keys are captured before the page underneath sees them (its own shortcuts must not fire behind the
   * scene). Fields in the overlay (the time slider) still get their keys.
   */
  private onKeyDown = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return
    if (ev.key !== 'Escape') ev.stopPropagation() // Esc is the overlay's: it closes the view
    if (ev.key === 'Shift') this.fast = true
    if (ev.code in MOVE_KEYS) {
      this.keys.add(ev.code)
      ev.preventDefault()
    }
  }

  private onKeyUp = (ev: KeyboardEvent) => {
    if (ev.key === 'Shift') this.fast = false
    this.keys.delete(ev.code)
  }

  private onBlur = () => {
    this.keys.clear()
    this.fast = false
  }

  private resize(): void {
    const c = this.i.container
    this.renderer.setSize(c.clientWidth, c.clientHeight)
    this.camera.aspect = c.clientWidth / Math.max(1, c.clientHeight)
    this.camera.updateProjectionMatrix()
  }

  // ---------- frame ----------

  private tick = (now: number) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    const dt = this.last === 0 ? 0 : Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    // Walk.
    let fwd = 0
    let side = 0
    for (const k of this.keys) {
      fwd += MOVE_KEYS[k][0]
      side += MOVE_KEYS[k][1]
    }
    if ((fwd !== 0 || side !== 0) && dt > 0) {
      const len = Math.hypot(fwd, side)
      const speed = this.i.walkSpeedMs * (this.fast ? C.FAST_TRAVEL : 1)
      const step = (speed * dt) / len
      const se = Math.sin(this.yaw)
      const ce = Math.cos(this.yaw)
      this.moveTo(this.e + (fwd * se + side * ce) * step, this.n + (fwd * ce - side * se) * step)
    }

    // Feet on the ground, eye above them.
    this.camera.position.set(this.e, this.heightAt(this.e, this.n) + C.EYE_HEIGHT_M, -this.n)
    this.camera.rotation.set(this.pitch, -this.yaw, 0)
    this.sky.position.copy(this.camera.position)
    this.placeSun()

    if (!this.lodAt || Math.hypot(this.e - this.lodAt.e, this.n - this.lodAt.n) > 20) {
      this.lodAt = { e: this.e, n: this.n }
      this.updateLod(false)
    }
    this.updateRocks(false)

    this.renderer.render(this.scene, this.camera)
    this.drawn = true
    if (dt > 0) this.watchFrames(now, dt)
    if (now - this.hudAt > 100) {
      this.hudAt = now
      this.sendHud()
    }
  }

  /** Lower detail when frames are slow, raise it again when there is time to spare. */
  private watchFrames(now: number, dt: number): void {
    // The first seconds compile shaders and build the ground: not a sign of a slow machine.
    if (this.openedAt === 0) this.openedAt = now
    if (now - this.openedAt < C.QUALITY_WARMUP_S * 1000) return
    this.frameTimes.push(dt * 1000)
    if (this.windowStart === 0) this.windowStart = now
    if (now - this.windowStart < C.QUALITY_WINDOW_S * 1000) return
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    this.fps = 1000 / avg
    this.frameTimes = []
    this.windowStart = now
    if (avg > C.SLOW_FRAME_MS && this.quality < C.QUALITY_LEVELS.length - 1) {
      this.setQuality(this.quality + 1)
      this.lastDrop = now
      this.quickSince = 0
    } else if (avg < C.FAST_FRAME_MS && this.quality > 0 && now - this.lastDrop > C.QUALITY_RAISE_COOLDOWN_S * 1000) {
      if (this.quickSince === 0) this.quickSince = now
      if (now - this.quickSince > C.QUALITY_RAISE_AFTER_S * 1000) {
        this.setQuality(this.quality - 1)
        this.quickSince = 0
      }
    } else {
      this.quickSince = 0
    }
  }

  private setQuality(level: number): void {
    this.quality = level
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, C.QUALITY_LEVELS[level].pixelRatio))
    const px = C.QUALITY_LEVELS[level].shadowMapPx
    this.sun.shadow.mapSize.set(px, px)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.lodAt = null
    this.updateRocks(true)
  }

  private sendHud(): void {
    const g = this.gmap
    const deg = ((((this.yaw * 180) / Math.PI) % 360) + 360) % 360
    this.i.onHud({
      position: toLatLon(this.frame, this.e, this.n),
      headingDeg: deg,
      eyeHeightM: C.EYE_HEIGHT_M,
      slopeDeg: slopeAt(this.i.grid, g.fx0 + this.e * g.fxPerE, g.fy0 + this.n * g.fyPerN),
      fast: this.fast,
      quality: C.QUALITY_LEVELS[this.quality].name,
      fps: this.fps,
      sunElevationDeg: this.sunElevationDeg,
      loading: !this.drawn,
    })
  }
}
