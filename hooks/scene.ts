import { CLAUDE_HALF, PAPER_SHAPE, claude, type Mood, type Pose } from './claude.js'
import {
  DEFAULT_STATE,
  FULL_WINDOW,
  LITE_MAX_HELPERS,
  MAX_HELPERS,
  clampFit,
  clampHelpers,
  type Action,
  type Dim,
  type Fit,
  type Level,
  type SceneState,
} from './levels.js'

// One camera looks into one room, so every wall, window, lamp and cabinet
// lines up on the same vanishing point.
//
// Screen space is VIEW_W by 1000 units. The horizon (eye level) is at EYE_Y
// and the vanishing point at (VIEW_W / 2, EYE_Y). The room scales to fit the
// uncovered part of the window, anchored to the bottom, and simply carries on
// (more wall, more ceiling) into any space left over, so nothing is cropped.
//
// A point in the room is (X, Y, s): X across from the middle (negative is
// left), Y down from eye level, and s its depth as a scale, 1 at the front of
// the picture and smaller farther back. It lands on screen at
//   (VIEW_W / 2 + X * s, EYE_Y + Y * s).

// ===== Placement: nudge these after looking at the scene in your window =====

// --- Camera and room ---
/** The design shape of the room: 1600 wide by 1000 tall. */
export const VIEW_W = 1600
/** Eye level: where the vanishing point sits, from the top (0) to the bottom (1000). */
export const EYE_Y = 460
/** Half the room's width. Larger pushes the side walls out. */
export const ROOM_HALF_WIDTH = 900
/** How far back the far wall is: smaller is deeper. */
export const BACK_WALL_SCALE = 0.63

// --- Windows, one on each side wall ---
/** Depth of the window's near and far edges (same scale as above). */
export const WINDOW_NEAR = 0.85
export const WINDOW_FAR = 0.7
/** Window top and bottom, measured from eye level (negative is above it). */
export const WINDOW_TOP = -300
export const WINDOW_BOTTOM = 0

// --- Cabinets ---
/** Depth of the cabinets' fronts. Closer to 1 brings them forward. */
export const STACK_DEPTH = 0.88
/** Distance from the middle to each stack's outer side, in room units. Larger pushes stacks to the edges. */
export const STACK_OUTER_X = 720
/** One cabinet's front on screen, and how deep it runs back in room units. */
export const CABINET_WIDTH = 110
export const CABINET_HEIGHT = 130
export const CABINET_DEPTH = 80
export const COLUMN_GAP = 6
/** Most columns a side may have, counting from the outside inward. */
export const MAX_INWARD_COLUMNS = 3
/** Most cabinets in one column. */
export const MAX_STACK_HEIGHT = 4

// --- Claude ---
/** Claude's size on screen: 1 is about half a cabinet tall. */
export const CLAUDE_SCALE = 1.5
/** Depth of Claude's lane: in front of the cabinets. */
export const CLAUDE_DEPTH = 0.95
/** Gaps between each stack and where Claude stops to file. */
export const CLAUDE_PATH_START = 14
export const CLAUDE_PATH_END = 14

// --- Helpers: one small mascot per working subagent ---
/** Each helper's lane depth, in the order helpers join. Below 0.82 runs behind the cabinets. */
export const HELPER_LANES = [0.78, 0.92, 0.74, 0.8, 0.935, 0.76]
/** Helper size next to the main Claude. */
export const HELPER_SIZE = 0.7
/**
 * Shortest body bounce, in seconds. A bounce faster than about three a second
 * over several mascots can trip the app's flash check, which holds the scene still.
 */
export const BOB_MIN_SECONDS = 0.34

// --- Background desks along the far wall ---
export type DeskItem = 'papers' | 'lamp' | 'plant' | 'typewriter' | 'printer'

/**
 * Each desk: x in room units from the middle (scaled with the room), its
 * depth, and what stands on it, from its outer end inward (up to three).
 */
export const BACK_DESKS: ReadonlyArray<{ x: number; depth: number; kit: readonly DeskItem[] }> = [
  { x: -470, depth: 0.69, kit: ['papers', 'plant', 'lamp'] },
  { x: -190, depth: 0.72, kit: ['typewriter', 'papers', 'plant'] },
  { x: 190, depth: 0.72, kit: ['printer', 'papers', 'lamp'] },
  { x: 470, depth: 0.69, kit: ['papers', 'typewriter', 'lamp'] },
]
/** Where the three things on a desk stand, in room units from its outer end. */
export const DESK_SLOTS = [45, 120, 188]
/** Desk size in room units: width, depth front to back, and height. */
export const DESK_WIDTH = 230
export const DESK_DEPTH = 110
export const DESK_HEIGHT = 150

// --- Cabinets along the far wall ---
/**
 * Cabinets that line up against the far wall as the context fills, from each
 * corner inward, standing behind the desks and rising above them. Nobody
 * files in them: they are just more of the office filling up. Cabinets per
 * column, corner column first, for each level.
 */
export const BACK_STACKS: Record<Level, { left: number[]; right: number[] }> = {
  1: { left: [], right: [] },
  2: { left: [1], right: [] },
  3: { left: [1, 1], right: [1] },
  4: { left: [2, 1, 1], right: [1, 1, 1] },
  5: { left: [2, 2, 1, 1], right: [2, 1, 2, 1] },
  6: { left: [3, 2, 3, 2], right: [3, 3, 2, 2] },
}
/** Depth of the back cabinets' fronts: just in front of the far wall. */
export const BACK_STACK_DEPTH = 0.665
/** Gap between a back stack and the side wall, in room units. */
export const BACK_STACK_INSET = 15
/** Back cabinets stop this far (room units) from the middle, behind the chat. */
export const BACK_STACK_MIN_X = 200

// --- Dimming behind the chat ---
/** How dark the middle of the scene gets for each `dim` setting (0 to 1). */
export const CENTER_DIM: Record<Dim, number> = { light: 0.18, medium: 0.32, strong: 0.46 }
/** Where the dark band reaches full strength, as a share of the room's width from each side. */
export const CENTER_DIM_EDGE = 0.3

// --- Lite mode ---
/**
 * The animations lite mode leaves out: everything in the background. Their
 * parts stay where they are drawn; flying papers and popping drawers are not
 * drawn at all, and at most LITE_MAX_HELPERS helpers show.
 */
export const LITE_STILL = [
  'twinkle',
  'cloud',
  'rain-',
  'lightning',
  'storm-glow',
  '.hand',
  'clock-turn',
  'sway',
  'swing',
  'tw-feed',
  'print-out',
]

// --- Papers, lamps, wall things ---
/** Papers never fly higher than this (0 is the top of the room). */
export const PAPER_ZONE_TOP = 240
/** How far from its stack's outer side a paper may drift toward the middle. */
export const PAPER_ZONE_WIDTH = 440
/** Where each lamp hangs (room units from the middle), its depth, and its drop from the ceiling. */
export const LAMP_X = 520
export const LAMP_DEPTH = 0.8
export const LAMP_DROP = 300
/** The clock and cork board on the far wall, in room units from the middle and from eye level. */
export const CLOCK_X = 640
export const CLOCK_Y = -230
export const BOARD_X = -640
export const BOARD_Y = -160
// ============================================================================

export type Weather = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'downpour' | 'storm'

export type LevelLook = {
  /** Cabinets per column, outer column first. */
  left: number[]
  right: number[]
  /** Seconds for one trip to the right stack and back. */
  runSeconds: number
  /** Share of the trip spent filing at each stack, 0 to 0.25. */
  pause: number
  /** Seconds per footstep; also the body bounce. */
  stepSeconds: number
  /** Flying papers on each side. */
  papers: number
  /** Drawers popping open and shut on each side. */
  drawers: number
  mood: Mood
  weather: Weather
  /** The far wall's color; side walls are a shade darker. */
  wall: string
  /** How far the lamps swing each way, in degrees, and seconds per swing. */
  swing: number
  swingSeconds: number
  /** Seconds for the clock's minute hand to go round once. */
  clockSeconds: number
}

export const LEVEL_LOOKS: Record<Level, LevelLook> = {
  1: { left: [1], right: [1], runSeconds: 16, pause: 0.22, stepSeconds: 0.7, papers: 0, drawers: 0, mood: 'calm', weather: 'clear', wall: '#29303d', swing: 3, swingSeconds: 6, clockSeconds: 60 },
  2: { left: [2], right: [1], runSeconds: 11, pause: 0.18, stepSeconds: 0.5, papers: 0, drawers: 0, mood: 'calm', weather: 'cloudy', wall: '#2a2f3d', swing: 4, swingSeconds: 5, clockSeconds: 30 },
  3: { left: [2, 1], right: [2], runSeconds: 8, pause: 0.14, stepSeconds: 0.38, papers: 1, drawers: 0, mood: 'busy', weather: 'drizzle', wall: '#2c2e3c', swing: 6, swingSeconds: 4, clockSeconds: 15 },
  4: { left: [3, 1], right: [2, 1], runSeconds: 5.5, pause: 0.1, stepSeconds: 0.28, papers: 2, drawers: 1, mood: 'stressed', weather: 'rain', wall: '#302c3b', swing: 9, swingSeconds: 3, clockSeconds: 8 },
  5: { left: [3, 2], right: [3, 2], runSeconds: 3.6, pause: 0.07, stepSeconds: 0.2, papers: 4, drawers: 2, mood: 'panic', weather: 'downpour', wall: '#352a39', swing: 13, swingSeconds: 2.2, clockSeconds: 4 },
  6: { left: [4, 3, 1], right: [4, 2, 1], runSeconds: 2.4, pause: 0.04, stepSeconds: 0.15, papers: 6, drawers: 3, mood: 'chaos', weather: 'storm', wall: '#3a2835', swing: 18, swingSeconds: 1.6, clockSeconds: 2 },
}

type WeatherLook = { sky: string; clouds: number; cloud: string; rain: number; rainSeconds: number; slant: number; stars: boolean }

const WEATHER: Record<Weather, WeatherLook> = {
  clear: { sky: '#101c36', clouds: 0, cloud: '#2a3550', rain: 0, rainSeconds: 1, slant: 0, stars: true },
  cloudy: { sky: '#141d30', clouds: 2, cloud: '#2b3448', rain: 0, rainSeconds: 1, slant: 0, stars: true },
  drizzle: { sky: '#151b27', clouds: 3, cloud: '#272e3c', rain: 8, rainSeconds: 1.4, slant: 3, stars: false },
  rain: { sky: '#121721', clouds: 3, cloud: '#232a36', rain: 14, rainSeconds: 0.95, slant: 6, stars: false },
  downpour: { sky: '#0f131b', clouds: 4, cloud: '#1f252f', rain: 22, rainSeconds: 0.7, slant: 10, stars: false },
  storm: { sky: '#0c0f16', clouds: 4, cloud: '#1b2029', rain: 28, rainSeconds: 0.55, slant: 14, stars: false },
}

const COLORS = {
  ceiling: '#15171d',
  floor: '#2a1f18',
  floorLine: '#1c150f',
  baseboard: '#17120e',
  cabinetFront: '#80786d',
  cabinetSide: '#5a534a',
  cabinetTop: '#a0978a',
  cabinetEdge: '#4a443c',
  drawer: '#958c7f',
  handle: '#3f3a33',
  label: '#e4ddcf',
  paper: '#f2ede2',
  frame: '#3d3229',
  rain: '#a9bbd8',
  lampShade: '#2f4a3c',
  lampLight: '#ffd9a0',
}

/** The window shape assumed when working out how wide the uncovered band is. */
export const ASSUMED_WINDOW_ASPECT = 16 / 9

// The room's layout for one band. A band narrower than the design narrows the
// room itself (walls, stacks, lamps closer together, cabinets a little smaller)
// so it still fills the band's height instead of shrinking into a corner.
type Geometry = {
  viewW: number
  roomW: number
  stackOuter: number
  cabW: number
  cabH: number
  lampX: number
  clockX: number
  boardX: number
  claudeScale: number
}

function geometry(fit: Fit): Geometry {
  const bandAspect = ASSUMED_WINDOW_ASPECT * (1 - (fit.left + fit.right) / 100)
  const viewW = Math.max(1000, Math.min(VIEW_W, bandAspect * 1000))
  const k = viewW / VIEW_W
  const size = Math.max(0.72, Math.min(1, 0.35 + 0.65 * k))
  return {
    viewW,
    roomW: ROOM_HALF_WIDTH * k,
    stackOuter: STACK_OUTER_X * k,
    cabW: CABINET_WIDTH * size,
    cabH: CABINET_HEIGHT * size,
    lampX: LAMP_X * k,
    clockX: CLOCK_X * k,
    boardX: BOARD_X * k,
    claudeScale: CLAUDE_SCALE * size,
  }
}

let G = geometry(FULL_WINDOW)
/** Whether the scene being drawn is in lite mode; set at the start of scene(). */
let LITE = false
let CX = G.viewW / 2

function useGeometry(fit: Fit) {
  G = geometry(fit)
  CX = G.viewW / 2
  CAB_W = G.cabW / STACK_DEPTH
  CAB_H = G.cabH / STACK_DEPTH
}
/** World Y of the floor and ceiling: the picture is 1000 tall at depth 1. */
const FLOOR = 1000 - EYE_Y
const CEILING = -EYE_Y
/** How near the room's planes are drawn, so they fill any spare space. */
const NEAR = 3

type Point = [number, number]

const n = (v: number) => String(Math.round(v * 100) / 100)
const pts = (list: Point[]) => list.map(([x, y]) => n(x) + ',' + n(y)).join(' ')

/** Where a room point lands on screen. */
function at(x: number, y: number, s: number): Point {
  return [CX + x * s, EYE_Y + y * s]
}

/** The depth halfway between two depths, measured in the room, not on screen. */
function midDepth(a: number, b: number): number {
  return 2 / (1 / a + 1 / b)
}

/** The depth a given distance (room units) behind another depth. */
function behind(s: number, distance: number): number {
  return 1 / (1 / s + distance / 1000)
}

function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16)
  const c = [v >> 16, (v >> 8) & 255, v & 255].map(x => Math.max(0, Math.min(255, Math.round(x * f))))
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
}

// A small seeded random, so a level always draws the same scene.
function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ---------------------------------------------------------------- the room

function room(look: LevelLook): string {
  const W = G.roomW
  const B = BACK_WALL_SCALE
  const side = shade(look.wall, 0.78)
  const wainscot = FLOOR - 380
  const base = FLOOR - 15
  const plane = (a: Point, b: Point, c: Point, d: Point, fill: string, extra = '') =>
    `<polygon points="${pts([a, b, c, d])}" fill="${fill}"${extra}/>`
  const dark = ' opacity="0.16"'

  let out =
    `<rect x="-4000" y="-4000" width="${VIEW_W + 8000}" height="9000" fill="${COLORS.ceiling}"/>` +
    // Far wall, with its wainscot and baseboard.
    plane(at(-W, CEILING, B), at(W, CEILING, B), at(W, FLOOR, B), at(-W, FLOOR, B), look.wall) +
    plane(at(-W, wainscot, B), at(W, wainscot, B), at(W, FLOOR, B), at(-W, FLOOR, B), '#000000', dark) +
    plane(at(-W, base, B), at(W, base, B), at(W, FLOOR, B), at(-W, FLOOR, B), COLORS.baseboard) +
    // Floor and ceiling.
    plane(at(-W, FLOOR, NEAR), at(W, FLOOR, NEAR), at(W, FLOOR, B), at(-W, FLOOR, B), COLORS.floor) +
    plane(at(-W, CEILING, NEAR), at(W, CEILING, NEAR), at(W, CEILING, B), at(-W, CEILING, B), COLORS.ceiling)

  // Floorboards running back, and seams across them.
  for (let x = -W; x <= W; x += 100) {
    const [x1, y1] = at(x, FLOOR, NEAR)
    const [x2, y2] = at(x, FLOOR, B)
    out += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${COLORS.floorLine}" stroke-width="2"/>`
  }
  for (const s of [1, 0.88, 0.78, 0.7]) {
    const [x1, y1] = at(-W, FLOOR, s)
    const [x2, y2] = at(W, FLOOR, s)
    out += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${COLORS.floorLine}" stroke-width="1.5" opacity="0.6"/>`
  }
  // Ceiling beams.
  for (let x = -W + 150; x < W; x += 300) {
    const [x1, y1] = at(x, CEILING, NEAR)
    const [x2, y2] = at(x, CEILING, B)
    out += `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#000000" stroke-width="4" opacity="0.35"/>`
  }

  // Side walls, each with wainscot, baseboard and its corner line.
  for (const sx of [-W, W]) {
    out +=
      plane(at(sx, CEILING, NEAR), at(sx, CEILING, B), at(sx, FLOOR, B), at(sx, FLOOR, NEAR), side) +
      plane(at(sx, wainscot, NEAR), at(sx, wainscot, B), at(sx, FLOOR, B), at(sx, FLOOR, NEAR), '#000000', dark) +
      plane(at(sx, base, NEAR), at(sx, base, B), at(sx, FLOOR, B), at(sx, FLOOR, NEAR), COLORS.baseboard)
    const [cx, top] = at(sx, CEILING, B)
    const [, bottom] = at(sx, FLOOR, B)
    out += `<line x1="${n(cx)}" y1="${n(top)}" x2="${n(cx)}" y2="${n(bottom)}" stroke="#000000" stroke-width="3" opacity="0.4"/>`
  }
  return out
}

function windowView(level: Level, which: 'left' | 'right', css: string[]): string {
  const w = WEATHER[LEVEL_LOOKS[level].weather]
  const sx = which === 'left' ? -G.roomW : G.roomW
  const rnd = random(level * 31 + (which === 'left' ? 5 : 9))
  const p1 = at(sx, WINDOW_TOP, WINDOW_NEAR)
  const p2 = at(sx, WINDOW_TOP, WINDOW_FAR)
  const p3 = at(sx, WINDOW_BOTTOM, WINDOW_FAR)
  const p4 = at(sx, WINDOW_BOTTOM, WINDOW_NEAR)
  const quad = pts([p1, p2, p3, p4])
  const xMin = Math.min(p1[0], p2[0])
  const xMax = Math.max(p1[0], p2[0])
  const yMin = Math.min(p1[1], p2[1])
  const yMax = Math.max(p3[1], p4[1])
  const width = xMax - xMin
  const span = yMax - yMin
  const id = `win-${which}`
  let inside = `<rect x="${n(xMin)}" y="${n(yMin)}" width="${n(width)}" height="${n(span)}" fill="${w.sky}"/>`

  if (w.stars) {
    for (let s = 0; s < 6; s++) {
      const x = xMin + 10 + rnd() * (width - 20)
      const y = yMin + 20 + rnd() * span * 0.5
      inside += `<circle class="twinkle" cx="${n(x)}" cy="${n(y)}" r="1.8" fill="#ffffff" opacity="0.7" style="animation-delay:${n(-rnd() * 4)}s"/>`
    }
    const mx = xMin + width * 0.5
    const my = yMin + span * 0.3
    inside += `<circle cx="${n(mx)}" cy="${n(my)}" r="15" fill="#e9e4c8"/><circle cx="${n(mx + 6)}" cy="${n(my - 4)}" r="13" fill="${w.sky}"/>`
  }

  for (let c = 0; c < w.clouds; c++) {
    const y = yMin + 15 + c * 28 + rnd() * 15
    const s = 0.7 + rnd() * 0.5
    inside +=
      `<g class="cloud" style="animation-duration:${n(26 + rnd() * 20)}s;animation-delay:${n(-rnd() * 40)}s">` +
      `<g transform="translate(${n(xMin - 50)} ${n(y)}) scale(${n(s)})">` +
      `<ellipse cx="0" cy="0" rx="34" ry="13" fill="${w.cloud}"/><ellipse cx="-14" cy="-8" rx="16" ry="12" fill="${w.cloud}"/>` +
      `<ellipse cx="12" cy="-10" rx="18" ry="14" fill="${w.cloud}"/></g></g>`
  }

  if (w.rain > 0) {
    let drops = ''
    for (let r = 0; r < w.rain; r++) {
      const x = xMin - 10 + rnd() * (width + 30)
      const y = yMin + rnd() * span
      const len = 14 + rnd() * 12
      // The copy sits one loop up-wind, so after a loop it lands on the original.
      for (const [dx, dy] of [[0, 0], [w.slant * (span / 20), -span]] as const) {
        drops += `<line x1="${n(x + dx)}" y1="${n(y + dy)}" x2="${n(x + dx - w.slant)}" y2="${n(y + dy + len)}"/>`
      }
    }
    const name = `rain-${which}`
    css.push(
      `.${name}{animation:${name} ${w.rainSeconds}s linear infinite}`,
      `@keyframes ${name}{0%{transform:translate(0px,0px)}100%{transform:translate(${n(-w.slant * (span / 20))}px,${n(span)}px)}}`,
    )
    inside += `<g class="${name}" stroke="${COLORS.rain}" stroke-width="1.6" stroke-linecap="round" opacity="0.32">${drops}</g>`
  }

  if (LEVEL_LOOKS[level].weather === 'storm') {
    inside += `<rect class="lightning" x="${n(xMin)}" y="${n(yMin)}" width="${n(width)}" height="${n(span)}" fill="#c9d4ff" opacity="0" style="animation-delay:${which === 'left' ? '0s' : '-4s'}"/>`
  }

  // Cross bars at the window's true middle, and a sill jutting into the room.
  const mid = midDepth(WINDOW_NEAR, WINDOW_FAR)
  const midY = (WINDOW_TOP + WINDOW_BOTTOM) / 2
  const [vx1, vy1] = at(sx, WINDOW_TOP, mid)
  const [vx2, vy2] = at(sx, WINDOW_BOTTOM, mid)
  const [hx1, hy1] = at(sx, midY, WINDOW_NEAR)
  const [hx2, hy2] = at(sx, midY, WINDOW_FAR)
  const inward = which === 'left' ? 30 : -30
  const sill = [at(sx, WINDOW_BOTTOM + 6, WINDOW_NEAR), at(sx, WINDOW_BOTTOM + 6, WINDOW_FAR), at(sx + inward, WINDOW_BOTTOM + 6, WINDOW_FAR), at(sx + inward, WINDOW_BOTTOM + 6, WINDOW_NEAR)]
  return (
    `<clipPath id="${id}"><polygon points="${quad}"/></clipPath>` +
    `<g clip-path="url(#${id})">${inside}</g>` +
    `<polygon points="${quad}" fill="none" stroke="${COLORS.frame}" stroke-width="8" stroke-linejoin="round"/>` +
    `<line x1="${n(vx1)}" y1="${n(vy1)}" x2="${n(vx2)}" y2="${n(vy2)}" stroke="${COLORS.frame}" stroke-width="5"/>` +
    `<line x1="${n(hx1)}" y1="${n(hy1)}" x2="${n(hx2)}" y2="${n(hy2)}" stroke="${COLORS.frame}" stroke-width="5"/>` +
    `<polygon points="${pts(sill)}" fill="${shade(COLORS.frame, 1.3)}"/>`
  )
}

function corkBoard(): string {
  const [x, y] = at(G.boardX, BOARD_Y, BACK_WALL_SCALE)
  const k = BACK_WALL_SCALE * 1.5
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k)})">` +
    `<rect x="-48" y="-35" width="96" height="70" fill="#7a5a3a" stroke="#3d2c1d" stroke-width="5"/>` +
    `<rect x="-38" y="-25" width="22" height="18" fill="#e9d98b" transform="rotate(-6 -27 -16)"/>` +
    `<rect x="-8" y="-27" width="20" height="24" fill="${COLORS.paper}"/>` +
    `<rect x="18" y="-21" width="20" height="16" fill="#e8a7a0" transform="rotate(5 28 -13)"/>` +
    `<rect x="-30" y="3" width="26" height="20" fill="${COLORS.paper}" transform="rotate(4 -17 13)"/>` +
    `<rect x="6" y="5" width="24" height="18" fill="#a9c8e8"/></g>`
  )
}

function clock(level: Level): string {
  const [x, y] = at(G.clockX, CLOCK_Y, BACK_WALL_SCALE)
  const k = BACK_WALL_SCALE * 1.6
  const minute = LEVEL_LOOKS[level].clockSeconds
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k)})">` +
    `<circle cx="3" cy="4" r="36" fill="#000000" opacity="0.3"/>` +
    `<circle r="36" fill="${COLORS.label}" stroke="${COLORS.frame}" stroke-width="5"/>` +
    `<path d="M0 -28V-23M28 0H23M0 28V23M-28 0H-23" stroke="${COLORS.handle}" stroke-width="3"/>` +
    `<g class="hand" style="animation-duration:${n(minute * 12)}s"><path d="M0 0V-16" stroke="#1f1512" stroke-width="5" stroke-linecap="round"/></g>` +
    `<g class="hand" style="animation-duration:${n(minute)}s"><path d="M0 0V-26" stroke="#1f1512" stroke-width="3" stroke-linecap="round"/></g>` +
    `<circle r="4" fill="#1f1512"/></g>`
  )
}

// ---------------------------------------------------------------- background desks

/**
 * Desks along the far wall, each with its own kit: paper piles that grow with
 * the level, desk lamps, potted plants, typewriters and printers. Drawn in the
 * room, so they sit on the same vanishing point.
 */
function backDesks(level: Level, css: string[]): string {
  const k = G.viewW / VIEW_W
  let out = ''
  css.push(
    `.sway{transform-box:fill-box;transform-origin:50% 100%;animation:plant-sway 5s ease-in-out infinite alternate}`,
    `@keyframes plant-sway{0%{transform:rotate(-3deg)}100%{transform:rotate(3deg)}}`,
    `.tw-feed{animation:tw-feed 3s steps(5) infinite}`,
    `@keyframes tw-feed{0%{transform:translateY(0px)}100%{transform:translateY(-8px)}}`,
    `.print-out{animation:print-out 4s ease-in-out infinite}`,
    `@keyframes print-out{0%{transform:translateY(-6px);opacity:0}20%{opacity:1}80%{transform:translateY(4px);opacity:1}100%{transform:translateY(6px);opacity:0}}`,
  )
  BACK_DESKS.forEach((d, i) => {
    const sf = d.depth
    const sb = behind(sf, DESK_DEPTH)
    const sm = midDepth(sf, sb)
    const x0 = d.x * k - DESK_WIDTH / 2
    const x1 = x0 + DESK_WIDTH
    const top = FLOOR - DESK_HEIGHT
    const slab = 12
    const leg = (x: number, s: number, fill: string) =>
      `<polygon points="${pts([at(x, top + slab, s), at(x + 10, top + slab, s), at(x + 10, FLOOR, s), at(x, FLOOR, s)])}" fill="${fill}"/>`
    // The side of the slab that faces the middle shows.
    const inner = d.x < 0 ? x1 : x0
    out +=
      `<polygon points="${pts([at(x0 - 10, FLOOR, sf), at(x1 + 10, FLOOR, sf), at(x1 + 10, FLOOR, sb), at(x0 - 10, FLOOR, sb)])}" fill="#000000" opacity="0.28"/>` +
      leg(x0 + 8, sb, '#2a1e16') +
      leg(x1 - 18, sb, '#2a1e16') +
      leg(x0 + 8, sf, '#3a2a1f') +
      leg(x1 - 18, sf, '#3a2a1f') +
      `<polygon points="${pts([at(inner, top, sf), at(inner, top, sb), at(inner, top + slab, sb), at(inner, top + slab, sf)])}" fill="#4a3526"/>` +
      `<polygon points="${pts([at(x0, top, sf), at(x1, top, sf), at(x1, top, sb), at(x0, top, sb)])}" fill="#7a5a3c"/>` +
      `<polygon points="${pts([at(x0, top, sf), at(x1, top, sf), at(x1, top + slab, sf), at(x0, top + slab, sf)])}" fill="#5e4430"/>`

    // What stands on the desk, from its outer end inward.
    const middle = (x0 + x1) / 2
    d.kit.slice(0, DESK_SLOTS.length).forEach((item, slot) => {
      const offset = DESK_SLOTS[slot] ?? 0
      const x = d.x < 0 ? x0 + offset : x1 - offset
      out += deskItem(item, x, middle, level, top, sf, sm, i)
    })
  })
  return out
}

/** One thing on a desk, standing at room x on the desk top. */
function deskItem(item: DeskItem, x: number, middle: number, level: number, top: number, sf: number, sm: number, i: number): string {
  const [cx, cy] = at(x, top, sm)
  const s = sm * 1.3
  const p = (px: number, py: number) => `${n(cx + px * s)},${n(cy + py * s)}`
  switch (item) {
    case 'papers': {
      // A pile of papers, a sheet more per level, each a little askew.
      let out = ''
      for (let sheet = 0; sheet < 1 + level; sheet++) {
        const y = top - 3 - sheet * 3
        const skew = ((sheet * 7) % 5) - 2
        out += `<polygon points="${pts([at(x - 35 + skew, y, sf * 1.005), at(x + 35 + skew, y, sf * 1.005), at(x + 31 - skew, y, sm), at(x - 39 - skew, y, sm)])}" fill="${sheet % 2 ? '#e8e2d4' : COLORS.paper}" stroke="#bdb5a5" stroke-width="0.6"/>`
      }
      return out
    }
    case 'lamp': {
      // Base on the desk, an arm up and over toward the desk's middle, a shade with a warm pool below.
      const reach = x < middle ? 1 : -1
      const hx = cx + reach * 34 * s
      const hy = cy - 78 * s
      return (
        `<ellipse cx="${n(hx)}" cy="${n(cy - 1)}" rx="${n(40 * s)}" ry="${n(8 * s)}" fill="${COLORS.lampLight}" opacity="0.16"/>` +
        `<polygon points="${pts([[hx - 9 * s, hy + 8 * s], [hx + 9 * s, hy + 8 * s], [hx + 38 * s, cy - 2], [hx - 38 * s, cy - 2]])}" fill="${COLORS.lampLight}" opacity="0.1"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy - 2)}" rx="${n(14 * s)}" ry="${n(4 * s)}" fill="#22252b"/>` +
        `<path d="M${n(cx)} ${n(cy - 3)}L${n(cx - reach * 8 * s)} ${n(cy - 48 * s)}L${n(hx)} ${n(hy)}" stroke="#22252b" stroke-width="${n(4 * s)}" fill="none" stroke-linejoin="round"/>` +
        `<circle cx="${n(cx - reach * 8 * s)}" cy="${n(cy - 48 * s)}" r="${n(3.5 * s)}" fill="#3a3e46"/>` +
        `<path d="M${n(hx - 12 * s)} ${n(hy + 9 * s)}L${n(hx - 6 * s)} ${n(hy - 6 * s)}H${n(hx + 6 * s)}L${n(hx + 12 * s)} ${n(hy + 9 * s)}Z" fill="#2f4a3c"/>` +
        `<ellipse cx="${n(hx)}" cy="${n(hy + 9 * s)}" rx="${n(6 * s)}" ry="${n(2.5 * s)}" fill="#fff1d2"/>`
      )
    }
    case 'plant': {
      // A potted plant, swaying a little, each at its own moment.
      const g = sm * 1.25
      const leafSpots: Array<[number, number, number]> = [[-14, -34, -28], [12, -36, 24], [-4, -46, -6], [6, -28, 50], [-16, -22, -60]]
      const leaves = leafSpots
        .map(([dx, dy, r]) => `<ellipse cx="${n(dx * g)}" cy="${n(dy * g)}" rx="${n(6 * g)}" ry="${n(16 * g)}" fill="${r % 2 ? '#5f8f50' : '#4f7a45'}" transform="rotate(${r} ${n(dx * g)} ${n(dy * g)})"/>`)
        .join('')
      return (
        `<g transform="translate(${n(cx)} ${n(cy)})">` +
        `<g class="sway" style="animation-delay:${n(-i * 1.3)}s">${leaves}</g>` +
        `<path d="M${n(-12 * g)} ${n(-18 * g)}H${n(12 * g)}L${n(9 * g)} 0H${n(-9 * g)}Z" fill="#b5653f"/>` +
        `<rect x="${n(-13 * g)}" y="${n(-20 * g)}" width="${n(26 * g)}" height="${n(4 * g)}" fill="#c97a52"/></g>`
      )
    }
    case 'typewriter':
      // A sheet in the roller feeding up a line at a time, then the body and keys.
      return (
        `<g class="tw-feed" style="animation-delay:${n(-i * 0.7)}s">` +
        `<polygon points="${p(-13, -38)} ${p(13, -38)} ${p(13, -18)} ${p(-13, -18)}" fill="${COLORS.paper}"/>` +
        `<path d="M${n(cx - 9 * s)} ${n(cy - 33 * s)}h${n(18 * s)}M${n(cx - 9 * s)} ${n(cy - 29 * s)}h${n(13 * s)}" stroke="#9a9284" stroke-width="${n(1.2 * s)}"/></g>` +
        `<rect x="${n(cx - 22 * s)}" y="${n(cy - 21 * s)}" width="${n(44 * s)}" height="${n(6 * s)}" rx="${n(3 * s)}" fill="#1d1d21"/>` +
        `<polygon points="${p(-26, 0)} ${p(26, 0)} ${p(22, -15)} ${p(-22, -15)}" fill="#2c2c30"/>` +
        `<rect x="${n(cx - 18 * s)}" y="${n(cy - 10 * s)}" width="${n(36 * s)}" height="${n(4 * s)}" fill="#55555c"/>` +
        `<rect x="${n(cx - 15 * s)}" y="${n(cy - 5 * s)}" width="${n(30 * s)}" height="${n(3 * s)}" fill="#46464d"/>`
      )
    case 'printer':
      // Paper waiting at the back, the body, a sheet sliding out the front, a green light.
      return (
        `<polygon points="${p(-16, -28)} ${p(16, -28)} ${p(12, -46)} ${p(-12, -46)}" fill="${COLORS.paper}"/>` +
        `<polygon points="${p(-30, -22)} ${p(30, -22)} ${p(26, -29)} ${p(-26, -29)}" fill="#4c515b"/>` +
        `<rect x="${n(cx - 30 * s)}" y="${n(cy - 22 * s)}" width="${n(60 * s)}" height="${n(22 * s)}" rx="${n(2 * s)}" fill="#3a3e46"/>` +
        `<rect x="${n(cx - 21 * s)}" y="${n(cy - 13 * s)}" width="${n(42 * s)}" height="${n(3 * s)}" fill="#1d1d21"/>` +
        `<g class="print-out" style="animation-delay:${n(-i * 1.1)}s"><rect x="${n(cx - 16 * s)}" y="${n(cy - 11 * s)}" width="${n(32 * s)}" height="${n(9 * s)}" fill="${COLORS.paper}"/></g>` +
        `<circle cx="${n(cx + 24 * s)}" cy="${n(cy - 17 * s)}" r="${n(1.6 * s)}" fill="#6fe08a"/>`
      )
  }
}

// ---------------------------------------------------------------- back-wall cabinets

/**
 * Cabinets lining the far wall behind the desks. They pop in as the level
 * rises, like the front stacks, but have no flying papers or popping drawers,
 * and nobody runs to them. Drawn before the desks, which stand in front.
 */
function backStacks(level: Level, pop: boolean): string {
  const k = G.viewW / VIEW_W
  const f = BACK_STACK_DEPTH
  const b = behind(f, CABINET_DEPTH)
  const scale = f / STACK_DEPTH
  let out = ''
  let popIndex = 0
  for (const which of ['left', 'right'] as const) {
    const sign = which === 'left' ? -1 : 1
    const cols = BACK_STACKS[level][which]
    const before = level > 1 ? BACK_STACKS[(level - 1) as Level][which] : []
    // From the corner inward, stopping short of the middle.
    const outerX = G.roomW - BACK_STACK_INSET
    const fits = cols.filter((_, c) => outerX - c * (CAB_W + CAB_GAP) - CAB_W >= BACK_STACK_MIN_X * k)
    if (fits.length === 0) continue
    const innerAll = outerX - (fits.length - 1) * (CAB_W + CAB_GAP) - CAB_W
    out += `<polygon points="${pts([at(sign * (outerX + 10), FLOOR, f * 1.02), at(sign * (innerAll - 10), FLOOR, f * 1.02), at(sign * (innerAll - 10), FLOOR, b), at(sign * (outerX + 10), FLOOR, b)])}" fill="#000000" opacity="0.3"/>`
    fits.forEach((height, c) => {
      const outer = sign * (outerX - c * (CAB_W + CAB_GAP))
      const inner = sign * (Math.abs(outer) - CAB_W)
      const left = Math.min(outer, inner)
      const right = Math.max(outer, inner)
      for (let r = 0; r < height; r++) {
        const bottom = FLOOR - r * CAB_H
        const top = bottom - CAB_H
        const [x, y] = at(left, top, f)
        let box = `<polygon points="${pts([at(inner, top, f), at(inner, top, b), at(inner, bottom, b), at(inner, bottom, f)])}" fill="${COLORS.cabinetSide}"/>`
        if (r === height - 1 && top > 0) {
          box += `<polygon points="${pts([at(left, top, f), at(right, top, f), at(right, top, b), at(left, top, b)])}" fill="${COLORS.cabinetTop}"/>`
        }
        box += `<use href="#cab-front" transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})"/>`
        if (pop && r >= (before[c] ?? 0)) {
          out += `<g class="cab-pop" style="animation-delay:${n(0.5 + popIndex * 0.2)}s">${box}</g>`
          popIndex++
        } else {
          out += box
        }
      }
    })
  }
  return out
}

// ---------------------------------------------------------------- cabinets

// A cabinet's front, drawn once at its on-screen size and placed with <use>.
function cabinetFrontDef(): string {
  const w = G.cabW
  const h = G.cabH
  const slot = (h - 16) / 3
  let drawers = ''
  for (let i = 0; i < 3; i++) {
    const y = 8 + i * slot
    const dh = slot - 6
    drawers +=
      `<rect x="8" y="${n(y)}" width="${w - 16}" height="${n(dh)}" rx="2" fill="${COLORS.drawer}"/>` +
      `<rect x="8" y="${n(y + dh - 3)}" width="${w - 16}" height="3" fill="#000000" opacity="0.18"/>` +
      `<rect x="${n(w / 2 - 11)}" y="${n(y + dh / 2 - 2)}" width="22" height="6" rx="2" fill="${COLORS.handle}"/>` +
      `<rect x="16" y="${n(y + 5)}" width="18" height="9" fill="${COLORS.label}"/>`
  }
  return (
    `<g id="cab-front">` +
    `<rect width="${w}" height="${h}" fill="${COLORS.cabinetFront}" stroke="${COLORS.cabinetEdge}" stroke-width="2"/>` +
    drawers +
    `<rect y="${h - 4}" width="${w}" height="4" fill="#000000" opacity="0.25"/></g>`
  )
}

function columns(side: number[]): number[] {
  return side.slice(0, MAX_INWARD_COLUMNS).map(h => Math.min(h, MAX_STACK_HEIGHT))
}

// Cabinet size and spacing in room units, from their on-screen size at STACK_DEPTH.
let CAB_W = 0
let CAB_H = 0
const CAB_GAP = COLUMN_GAP / STACK_DEPTH
const STACK_BACK = behind(STACK_DEPTH, CABINET_DEPTH)

/** Room X of a column's outer and inner sides; sign is -1 for left, 1 for right. */
function columnSpan(c: number, sign: number): { outer: number; inner: number } {
  const outer = G.stackOuter - c * (CAB_W + CAB_GAP)
  return { outer: sign * outer, inner: sign * (outer - CAB_W) }
}

/** Screen x of the stack's innermost edge, side and all. */
function stackReach(side: number[], sign: number): number {
  const cols = columns(side)
  if (cols.length === 0) return at(sign * G.stackOuter, 0, STACK_DEPTH)[0]
  const { inner } = columnSpan(cols.length - 1, sign)
  return at(inner, 0, STACK_BACK)[0]
}

/** One side's cabinets, drawers and papers. */
function cabinets(level: Level, which: 'left' | 'right', css: string[], pop: boolean): string {
  const look = LEVEL_LOOKS[level]
  const sign = which === 'left' ? -1 : 1
  const cols = columns(look[which])
  const before = level > 1 ? columns(LEVEL_LOOKS[(level - 1) as Level][which]) : []
  const rnd = random(level * 97 + (which === 'left' ? 1 : 2))
  const f = STACK_DEPTH
  const b = STACK_BACK
  let out = ''
  let popIndex = 0
  const old: Point[] = []

  // A soft shadow on the floor under the whole stack.
  if (cols.length > 0) {
    const outerX = sign * (G.stackOuter + 20)
    const innerX = columnSpan(cols.length - 1, sign).inner - sign * 20
    out += `<polygon points="${pts([at(outerX, FLOOR, f * 1.03), at(innerX, FLOOR, f * 1.03), at(innerX, FLOOR, b * 0.97), at(outerX, FLOOR, b * 0.97)])}" fill="#000000" opacity="0.35"/>`
  }

  // Outer columns first, so inner ones overlap their sides.
  cols.forEach((height, c) => {
    const { outer, inner } = columnSpan(c, sign)
    const left = Math.min(outer, inner)
    const right = Math.max(outer, inner)
    for (let r = 0; r < height; r++) {
      const bottom = FLOOR - r * CAB_H
      const top = bottom - CAB_H
      const [x, y] = at(left, top, f)
      // The side facing the middle, and the top when it is below eye level.
      let faces = `<polygon points="${pts([at(inner, top, f), at(inner, top, b), at(inner, bottom, b), at(inner, bottom, f)])}" fill="${COLORS.cabinetSide}"/>`
      if (r === height - 1 && top > 0) {
        faces += `<polygon points="${pts([at(left, top, f), at(right, top, f), at(right, top, b), at(left, top, b)])}" fill="${COLORS.cabinetTop}"/>`
      }
      const box = faces + `<use href="#cab-front" x="${n(x)}" y="${n(y)}"/>`
      if (pop && r >= (before[c] ?? 0)) {
        // Pops in out of nowhere with a little dust puff.
        const delay = n(0.3 + popIndex * 0.2) + 's'
        popIndex++
        out +=
          `<g class="cab-pop" style="animation-delay:${delay}">${box}</g>` +
          `<g class="puff" opacity="0" style="animation-delay:${delay}">` +
          `<circle cx="${n(x + 15)}" cy="${n(y + G.cabH - 6)}" r="14" fill="${COLORS.label}"/>` +
          `<circle cx="${n(x + G.cabW - 15)}" cy="${n(y + G.cabH - 6)}" r="12" fill="${COLORS.label}"/>` +
          `<circle cx="${n(x + G.cabW / 2)}" cy="${n(y + 8)}" r="10" fill="${COLORS.label}"/></g>`
      } else {
        out += box
        old.push([x, y])
      }
    }
  })

  // Drawers sliding out toward you and back, on cabinets that were already there.
  const slot = (G.cabH - 16) / 3
  for (let d = 0; d < Math.min(LITE ? 0 : look.drawers, old.length); d++) {
    const cab = old[(d * 2 + 1) % old.length]
    if (cab === undefined) continue
    const x = cab[0] + 8
    const y = cab[1] + 8 + (d % 3) * slot
    const w = G.cabW - 16
    const h = slot - 6
    const timing = `animation-duration:${n(1.4 + d * 0.6 + rnd() * 0.5)}s;animation-delay:${n(-rnd() * 2)}s`
    out +=
      `<g class="tips" style="${timing}">` +
      `<rect x="${n(x + 10)}" y="${n(y + 2)}" width="22" height="18" fill="${COLORS.paper}" transform="rotate(-8 ${n(x + 21)} ${n(y + 11)})"/>` +
      `<rect x="${n(x + 40)}" y="${n(y + 1)}" width="20" height="18" fill="${COLORS.paper}" transform="rotate(10 ${n(x + 50)} ${n(y + 10)})"/></g>` +
      `<g class="drawer" style="${timing}">` +
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${n(h)}" rx="2" fill="${COLORS.drawer}" stroke="${COLORS.cabinetEdge}" stroke-width="2"/>` +
      `<rect x="${n(x + w / 2 - 11)}" y="${n(y + h / 2 - 2)}" width="22" height="6" rx="2" fill="${COLORS.handle}"/></g>`
  }

  // Papers flying in arcs, kept within PAPER_ZONE_WIDTH of the stack's outer side.
  const outerScreen = at(sign * G.stackOuter, 0, f)[0]
  const zoneMin = sign < 0 ? outerScreen - 20 : outerScreen - PAPER_ZONE_WIDTH
  const zoneMax = sign < 0 ? outerScreen + PAPER_ZONE_WIDTH : outerScreen + 20
  const inward = -sign
  const speed = look.runSeconds / 8
  for (let p = 0; p < (LITE ? 0 : look.papers); p++) {
    const c = cols.length === 0 ? 0 : p % cols.length
    const { outer, inner } = columnSpan(c, sign)
    const sx = at(outer + (inner - outer) * (0.3 + rnd() * 0.4), 0, f)[0]
    const sy = at(0, FLOOR - (cols[c] ?? 0) * CAB_H, f)[1] - 12
    const clampX = (dx: number) => Math.max(zoneMin - sx, Math.min(zoneMax - sx, dx))
    const clampY = (dy: number) => Math.max(PAPER_ZONE_TOP - sy, dy)
    const rise = 120 + rnd() * 160
    const drift = (60 + rnd() * 140) * inward
    const spin = rnd() > 0.5 ? 1 : -1
    const to = (fx: number, fy: number, turn: number) =>
      `transform:translate(${n(clampX(drift * fx))}px,${n(clampY(-rise * fy))}px) rotate(${spin * turn}deg)`
    const name = `fly-${which}-${p}`
    css.push(
      `@keyframes ${name}{` +
        `0%{transform:translate(0px,0px) rotate(0deg);opacity:0}` +
        `10%{opacity:1}` +
        `30%{${to(0.3, 0.7, 120)}}` +
        `55%{${to(0.8, 1, 220)}}` +
        `80%{${to(1, 0.55, 300)};opacity:1}` +
        `100%{${to(1.1, 0.1, 380)};opacity:0}}`,
      `.${name}{transform-box:fill-box;transform-origin:50% 50%;animation:${name} ${n((2.4 + rnd() * 1.6) * Math.max(speed, 0.5))}s ease-in-out ${n(-rnd() * 3)}s infinite}`,
    )
    out += `<g transform="translate(${n(sx)} ${n(sy)})"><g class="${name}">${PAPER_SHAPE}</g></g>`
  }
  return out
}

// ---------------------------------------------------------------- lamps

function lamp(which: 'left' | 'right', part: 'body' | 'cone'): string {
  const sign = which === 'left' ? -1 : 1
  const [px, py] = at(sign * G.lampX, CEILING, LAMP_DEPTH)
  // Drawn in room units around the hook, then scaled to the lamp's depth.
  const y = LAMP_DROP
  const reach = FLOOR - CEILING - y - 26
  const spread = 300
  // The cord and shade sit at the lamp's depth, behind the stacks; the light
  // cone is drawn last so it falls over everything. Both swing as one.
  const open = `<g transform="translate(${n(px)} ${n(py)}) scale(${LAMP_DEPTH})"><g class="swing swing-${which}">`
  if (part === 'cone') {
    return open + `<polygon points="${pts([[-26, y + 26], [26, y + 26], [spread, y + 26 + reach], [-spread, y + 26 + reach]])}" fill="url(#lamp-glow)"/></g></g>`
  }
  return (
    open +
    `<line x1="0" y1="0" x2="0" y2="${y}" stroke="#0b0b0d" stroke-width="3"/>` +
    `<circle cx="0" cy="${y + 24}" r="34" fill="${COLORS.lampLight}" opacity="0.16"/>` +
    `<path d="M-40 ${y + 28}L-16 ${y}H16L40 ${y + 28}Z" fill="${COLORS.lampShade}"/>` +
    `<path d="M-16 ${y}H16L20 ${y + 7}H-20Z" fill="#ffffff" opacity="0.12"/>` +
    `<ellipse cx="0" cy="${y + 28}" rx="40" ry="6" fill="${shade(COLORS.lampShade, 0.6)}"/>` +
    `<ellipse cx="0" cy="${y + 30}" rx="10" ry="7" fill="#fff1d2"/>` +
    `</g></g>`
  )
}

// ---------------------------------------------------------------- helpers

/**
 * Helper mascots, one per working subagent: each runs its own lane at its own
 * pace. Lanes behind the cabinets are drawn before them, so stacks hide them.
 * Returns [drawn behind the cabinets, drawn in front].
 */
function helpers(count: number, look: LevelLook, css: string[], deskRight?: number): [string, string] {
  let behindStacks = ''
  let inFront = ''
  const lanes = HELPER_LANES.slice(0, count)
    .map((depth, i) => ({ depth, i }))
    .sort((a, b) => a.depth - b.depth)
  for (const { depth, i } of lanes) {
    const scale = G.claudeScale * HELPER_SIZE * (depth / CLAUDE_DEPTH)
    const half = CLAUDE_HALF * scale
    const isBehind = depth < STACK_BACK
    // In front of the stacks, stop short of them; behind, walk the open floor between them.
    const leftEdge = isBehind ? at(-G.stackOuter + CAB_W, 0, depth)[0] : stackReach(look.left, -1)
    const rightEdge = isBehind ? at(G.stackOuter - CAB_W, 0, depth)[0] : stackReach(look.right, 1)
    // While the desk is out, front lanes start past it instead of walking through it.
    const startX = Math.max(leftEdge + 10 + half, !isBehind && deskRight !== undefined ? deskRight + 8 + half : 0)
    const endX = Math.max(startX, rightEdge - 10 - half)
    const laneY = at(0, FLOOR, depth)[1]
    const seconds = look.runSeconds * (1.15 + 0.3 * (i % 3))
    const pause = 0.06 + 0.05 * (i % 3)
    const p = n(pause * 100)
    const back = n(50 + pause * 100)
    const delay = n(-seconds * ((i * 0.37) % 1))
    css.push(
      `.hr-${i}{animation:helper-run-${i} ${n(seconds)}s ease-in-out ${delay}s infinite}`,
      `@keyframes helper-run-${i}{0%,${p}%{transform:translateX(0px)}50%,${back}%{transform:translateX(${n(endX - startX)}px)}100%{transform:translateX(0px)}}`,
      `.facing.hf-${i}{animation:helper-face-${i} ${n(seconds)}s linear ${delay}s infinite}`,
      `@keyframes helper-face-${i}{0%,${p}%{transform:scaleX(-1)}${n(pause * 100 + 0.6)}%,${back}%{transform:scaleX(1)}${n(50 + pause * 100 + 0.6)}%,100%{transform:scaleX(-1)}}`,
    )
    const drawn = `<g class="hr-${i}"><g transform="translate(${n(startX)} ${n(laneY)}) scale(${n(scale)})">${claude(look.mood, { facing: `hf-${i}`, bob: 'hbob' })}</g></g>`
    if (isBehind) behindStacks += drawn
    else inFront += drawn
  }
  return [behindStacks, inFront]
}

// ---------------------------------------------------------------- the main Claude's actions

const POSES: Record<Action, Pose> = { file: 'carry', read: 'rummage', write: 'type', web: 'binoculars', think: 'think' }

/** Actions Claude does with its back to you, facing into the room. */
export const FACES_AWAY: readonly Action[] = ['read']

/** Seconds the old pose lingers while its props fade, before Claude sets off. */
export const MOVE_HOLD = 0.3
/** Longest walk from the old spot to the new one, in seconds. */
export const MOVE_MAX_WALK = 1.1
/** How much faster than its usual run Claude hurries to a new pose. */
export const MOVE_HURRY = 1.6
/** Walks shorter than this many units are skipped: Claude just turns into the new pose. */
const MOVE_MIN_DISTANCE = 6

/**
 * Where Claude stands for an action, before any run: by the left stack, or
 * stepped up to the pulled-out drawer when rummaging.
 */
function poseX(action: Action, look: LevelLook, startX: number): number {
  const reach = action === 'read' ? drawerBox(look)?.tr[0] : undefined
  return reach !== undefined ? reach + 40 * G.claudeScale : startX
}

type Move = { from: Action; fromX: number; toX: number; hold: number; walk: number; arrive: number }

/** The opening move from the previous action, or none when the scene opens as it stays. */
function movePlan(state: SceneState, look: LevelLook, startX: number, endX: number): Move | undefined {
  const from = state.from
  if (from === undefined || from === state.action) return undefined
  const fromX = from === 'file' ? startX + ((state.fromX ?? 0) / 100) * (endX - startX) : poseX(from, look, startX)
  const toX = poseX(state.action, look, startX)
  const hold = from === 'file' ? 0 : MOVE_HOLD
  const distance = Math.abs(toX - fromX)
  // The usual run covers the room in the half trip less its pause.
  const speed = (MOVE_HURRY * Math.max(1, endX - startX)) / (look.runSeconds * (0.5 - look.pause))
  const walk = distance < MOVE_MIN_DISTANCE ? 0 : Math.min(MOVE_MAX_WALK, Math.max(0.3, distance / speed))
  return { from, fromX, toX, hold, walk, arrive: hold + walk }
}

/** Claude for an action, placed at x; filing runs, every other action holds its pose. */
function posed(action: Action, look: LevelLook, x: number, laneY: number): string {
  const place = (inner: string) => `<g transform="translate(${n(x)} ${n(laneY)}) scale(${n(G.claudeScale)})">${inner}</g>`
  if (action === 'file') return `<g class="runner">${place(claude(look.mood))}</g>`
  const facing = action === 'read' ? 'still-left' : 'still-right'
  // Rummaging turns Claude away from you, into the drawer: no face shows.
  return place(claude(look.mood, { pose: POSES[action], facing, back: FACES_AWAY.includes(action) }))
}

/** What an action sets out around Claude: the drawer behind it, the desk in front. */
function propsFor(action: Action, look: LevelLook, startX: number, css: string[], pop: boolean): { behind: string; front: string } {
  if (action === 'read') return { behind: openDrawer(look, css, pop), front: '' }
  if (action === 'write') return { behind: '', front: desk(startX, css) }
  return { behind: '', front: '' }
}

/**
 * The main Claude. Filing runs between the stacks; every other action stays
 * by the left stack: rummaging in a pulled-out drawer, typing at a desk,
 * looking out through binoculars, or thinking.
 *
 * A scene that follows another action opens with a short move: the old pose
 * lingers while its props fade, Claude hurries over from where it was, and
 * settles into the new pose as its props fade in. Each part rests in its
 * finished place in the plain markup (the old ones hidden), so with motion
 * turned off the scene shows the new pose straight away.
 */
function mainClaude(state: SceneState, look: LevelLook, startX: number, endX: number, laneY: number, css: string[]): string {
  const { action, pop } = state
  const x = poseX(action, look, startX)
  const props = propsFor(action, look, startX, css, pop)
  const move = movePlan(state, look, startX, endX)
  if (move === undefined) return props.behind + posed(action, look, x, laneY) + props.front

  const { from, fromX, toX, hold, walk, arrive } = move
  const pct = (t: number) => n((t / arrive) * 100)
  let out = ''
  // The old props fade as Claude leaves them.
  const old = propsFor(from, look, startX, css, false)
  if (old.behind + old.front !== '') {
    css.push(`.mv-out{animation:mv-out 0.35s ease-in both}`, `@keyframes mv-out{0%{opacity:1}100%{opacity:0}}`)
    out += `<g class="mv-out" opacity="0">${old.behind}${old.front}</g>`
  }
  // The old pose holds a moment, unless Claude was mid-run.
  if (from !== 'file') {
    css.push(
      `.mv-ghost{animation:mv-ghost ${n(arrive)}s linear both}`,
      `@keyframes mv-ghost{0%,${pct(hold - 0.01)}%{opacity:1}${pct(hold)}%,100%{opacity:0}}`,
    )
    out += `<g class="mv-ghost" opacity="0">${posed(from, look, fromX, laneY)}</g>`
  }
  // Then it walks, facing the way it goes, from the old spot to the new one.
  if (walk > 0) {
    const facing = toX < fromX ? 'still-left' : 'still-right'
    css.push(
      `.mv-walker{animation:mv-walker ${n(arrive)}s linear both}`,
      `@keyframes mv-walker{0%{opacity:${hold > 0 ? 0 : 1}}${hold > 0 ? `${pct(hold - 0.01)}%{opacity:0}${pct(hold)}%{opacity:1}` : ''}${pct(arrive - 0.01)}%{opacity:1}100%{opacity:0}}`,
      `.mv-walk{animation:mv-walk ${n(walk)}s ease-in-out ${n(hold)}s both}`,
      `@keyframes mv-walk{0%{transform:translateX(0px)}100%{transform:translateX(${n(toX - fromX)}px)}}`,
    )
    out +=
      `<g class="mv-walker" opacity="0"><g class="mv-walk">` +
      `<g transform="translate(${n(fromX)} ${n(laneY)}) scale(${n(G.claudeScale)})">${claude(look.mood, { facing })}</g>` +
      `</g></g>`
  }
  // On arrival the new pose appears with a little squash and settle, and a
  // new run waits until then to set off.
  css.push(
    `.mv-in{animation:mv-in ${n(arrive)}s linear both}`,
    `@keyframes mv-in{0%,${pct(arrive - 0.01)}%{opacity:0}100%{opacity:1}}`,
    `.mv-settle{transform-box:fill-box;transform-origin:50% 100%;animation:mv-settle 0.4s ease-out ${n(arrive)}s both}`,
    `@keyframes mv-settle{0%{transform:scale(1.08,0.9)}45%{transform:scale(0.96,1.05)}100%{transform:scale(1,1)}}`,
    `.mv-in .runner,.mv-in .runner .facing{animation-delay:${n(arrive)}s}`,
    `.mv-prop{animation:mv-prop 0.4s ease-out ${n(Math.max(0, arrive - 0.1))}s both}`,
    `@keyframes mv-prop{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0px)}}`,
  )
  const wrapProp = (markup: string) => (markup === '' ? '' : `<g class="mv-prop">${markup}</g>`)
  return (
    wrapProp(props.behind) +
    out +
    `<g class="mv-in"><g class="mv-settle">${posed(action, look, x, laneY)}</g></g>` +
    wrapProp(props.front)
  )
}

/**
 * Seconds the opening move takes before the new pose is in place: a filing
 * run starts this late, which register.tsx needs to tell where Claude is later.
 */
export function moveSeconds(state: SceneState): number {
  useGeometry(clampFit(state.fit))
  const look = LEVEL_LOOKS[state.level]
  const { startX, endX } = runSpan(look)
  return movePlan(state, look, startX, endX)?.arrive ?? 0
}

/**
 * How far along its run (0 at the left stack, 100 at the right) a filing
 * Claude is, `seconds` after its run started. Follows the run's keyframes,
 * with smoothstep standing in for ease-in-out.
 */
export function runPosition(level: Level, seconds: number): number {
  const { runSeconds, pause } = LEVEL_LOOKS[level]
  if (!(seconds > 0)) return 0
  const u = (seconds % runSeconds) / runSeconds
  const ease = (t: number) => t * t * (3 - 2 * t)
  const leg = 0.5 - pause
  let f: number
  if (u < pause) f = 0
  else if (u < 0.5) f = ease((u - pause) / leg)
  else if (u < 0.5 + pause) f = 1
  else f = 1 - ease((u - 0.5 - pause) / leg)
  return Math.round(f * 100)
}

/** The run's two ends: where Claude files at the left stack and at the right. */
function runSpan(look: LevelLook): { startX: number; endX: number } {
  const half = CLAUDE_HALF * G.claudeScale
  return {
    startX: stackReach(look.left, -1) + CLAUDE_PATH_START + half,
    endX: stackReach(look.right, 1) - CLAUDE_PATH_END - half,
  }
}

/** The innermost left cabinet's middle drawer, pulled out toward you: where it is drawn. */
function drawerBox(look: LevelLook) {
  const cols = columns(look.left)
  if (cols.length === 0) return undefined
  const { outer, inner } = columnSpan(cols.length - 1, -1)
  const [cx, cy] = at(Math.min(outer, inner), FLOOR - CAB_H, STACK_DEPTH)
  const slot = (G.cabH - 16) / 3
  const x = cx + 8
  const y = cy + 8 + slot
  const w = G.cabW - 16
  const h = slot - 6
  // Pulling a drawer toward you grows it away from the vanishing point.
  const k = 1.09
  const out = (px: number, py: number): Point => [CX + (px - CX) * k, EYE_Y + (py - EYE_Y) * k]
  return { x, y, w, h, k, tl: out(x, y), tr: out(x + w, y), br: out(x + w, y + h) }
}

/** The open drawer, papers flying out. */
function openDrawer(look: LevelLook, css: string[], pop: boolean): string {
  const box = drawerBox(look)
  if (box === undefined) return ''
  const { x, y, w, h, k, tl, tr, br } = box
  let papers = ''
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * 22
    css.push(
      `.dig-paper-${i}{animation:dig-paper-${i} 1.3s ease-out ${n(-i * 0.43)}s infinite}`,
      `@keyframes dig-paper-${i}{0%{transform:translate(0px,0px) rotate(0deg);opacity:0}15%{opacity:1}` +
        `100%{transform:translate(${dx + 18}px,-${70 + i * 14}px) rotate(${(i - 1) * 120 + 60}deg);opacity:0}}`,
    )
    papers += `<g transform="translate(${n(tl[0] + (tr[0] - tl[0]) * (0.3 + i * 0.2))} ${n(tl[1] + 4)})"><g class="dig-paper-${i}">${PAPER_SHAPE}</g></g>`
  }
  const markup =
    // The drawer's inside, its side facing the middle, then its front.
    `<polygon points="${pts([[x, y], [x + w, y], tr, tl])}" fill="#3b362f"/>` +
    `<rect x="${n(tl[0] + 8)}" y="${n(tl[1] - 10)}" width="22" height="14" fill="${COLORS.paper}" transform="rotate(-6 ${n(tl[0] + 19)} ${n(tl[1] - 3)})"/>` +
    `<rect x="${n(tl[0] + 40)}" y="${n(tl[1] - 12)}" width="20" height="14" fill="${COLORS.paper}"/>` +
    `<polygon points="${pts([[x + w, y], tr, br, [x + w, y + h]])}" fill="${COLORS.cabinetSide}"/>` +
    `<rect x="${n(tl[0])}" y="${n(tl[1])}" width="${n(w * k)}" height="${n(h * k)}" rx="2" fill="${COLORS.drawer}" stroke="${COLORS.cabinetEdge}" stroke-width="2"/>` +
    `<rect x="${n(tl[0] + (w * k) / 2 - 11)}" y="${n(tl[1] + (h * k) / 2 - 3)}" width="22" height="6" rx="2" fill="${COLORS.handle}"/>` +
    papers
  // While cabinets pop in, the drawer waits until its cabinet is there.
  return pop ? `<g class="cab-pop" style="animation-delay:1.4s">${markup}</g>` : markup
}

/** A small desk with a typewriter, just right of Claude and a little in front. */
/** Where the desk stands on screen, left and right, for a Claude at startX. */
function deskSpan(startX: number): [number, number] {
  const k = G.claudeScale / 1.5
  const left = startX + 22 * k
  return [left, left + 150 * k]
}

function desk(startX: number, css: string[]): string {
  const s = CLAUDE_DEPTH + 0.015
  const k = G.claudeScale / 1.5
  const [left, right] = deskSpan(startX)
  const w = right - left
  const h = 76 * k
  const xl = (left - CX) / s
  const xr = xl + w / s
  const top = FLOOR - h / s
  const back = behind(s, 70)
  let faces = ''
  if (xr < 0) faces += `<polygon points="${pts([at(xr, top, s), at(xr, top, back), at(xr, FLOOR, back), at(xr, FLOOR, s)])}" fill="#3a2a1f"/>`
  if (xl > 0) faces += `<polygon points="${pts([at(xl, top, s), at(xl, top, back), at(xl, FLOOR, back), at(xl, FLOOR, s)])}" fill="#3a2a1f"/>`
  const [fx, fy] = at(xl, top, s)
  // The typewriter sits on the desk top, its sheet feeding up line by line.
  const tx = fx + w * 0.22
  const ty = fy - 4
  css.push(
    `.feed{animation:type-feed 2.4s steps(6) infinite}`,
    `@keyframes type-feed{0%{transform:translateY(0px)}100%{transform:translateY(-14px)}}`,
  )
  return (
    `<polygon points="${pts([at(xl, top, s), at(xr, top, s), at(xr, top, back), at(xl, top, back)])}" fill="#7a5a3c"/>` +
    faces +
    `<rect x="${n(fx)}" y="${n(fy)}" width="${n(w)}" height="${n(h)}" fill="#5e4430"/>` +
    `<rect x="${n(fx + 8)}" y="${n(fy + 10)}" width="${n(w - 16)}" height="${n(h * 0.3)}" fill="#4f3927" stroke="#3a2a1f" stroke-width="2"/>` +
    `<rect x="${n(fx + w / 2 - 10)}" y="${n(fy + 10 + h * 0.15 - 3)}" width="20" height="6" rx="2" fill="${COLORS.handle}"/>` +
    `<g class="feed"><rect x="${n(tx + 12)}" y="${n(ty - 34)}" width="${n(w * 0.34)}" height="30" fill="${COLORS.paper}"/>` +
    `<path d="M${n(tx + 17)} ${n(ty - 26)}h${n(w * 0.24)}M${n(tx + 17)} ${n(ty - 19)}h${n(w * 0.18)}" stroke="${COLORS.handle}" stroke-width="1.5" opacity="0.6"/></g>` +
    `<rect x="${n(tx)}" y="${n(ty - 12)}" width="${n(w * 0.5)}" height="16" rx="3" fill="#2c2c30"/>` +
    `<rect x="${n(tx + 6)}" y="${n(ty - 6)}" width="${n(w * 0.5 - 12)}" height="4" fill="#55555c"/>`
  )
}

// ---------------------------------------------------------------- styles

function bobKeyframes(mood: Mood): string {
  const lift = { calm: 2, busy: 3, stressed: 3, panic: 4, chaos: 5 }[mood]
  const tilt = { calm: 0, busy: 1, stressed: 2, panic: 3, chaos: 4 }[mood]
  return (
    `@keyframes claude-bob{0%,100%{transform:translateY(0px) rotate(${-tilt}deg)}` +
    `50%{transform:translateY(${-lift}px) rotate(${tilt}deg)}}`
  )
}

export function scene(input: Level | SceneState, fit: Fit = FULL_WINDOW): string {
  const state: SceneState = typeof input === 'number' ? { ...DEFAULT_STATE, level: input, fit } : input
  const level = state.level
  const look = LEVEL_LOOKS[level]
  const band = clampFit(state.fit)
  useGeometry(band)
  LITE = state.lite
  const css: string[] = []

  // Claude's trip: file at the left stack, run, file at the right, run back.
  const { startX, endX } = runSpan(look)
  const laneY = at(0, FLOOR, CLAUDE_DEPTH)[1]
  const p = n(look.pause * 100)
  const back = n(50 + look.pause * 100)
  const flip = 0.6
  const step = look.stepSeconds
  const deskRight = state.action === 'write' ? deskSpan(startX)[1] : undefined
  const helperCount = Math.min(clampHelpers(state.helpers), LITE ? LITE_MAX_HELPERS : MAX_HELPERS)
  const [helpersBehind, helpersFront] = helpers(helperCount, look, css, deskRight)

  const body =
    room(look) +
    windowView(level, 'left', css) +
    windowView(level, 'right', css) +
    corkBoard() +
    clock(level) +
    backStacks(level, state.pop) +
    backDesks(level, css) +
    lamp('left', 'body') +
    lamp('right', 'body') +
    helpersBehind +
    cabinets(level, 'left', css, state.pop) +
    cabinets(level, 'right', css, state.pop) +
    helpersFront +
    mainClaude(state, look, startX, endX, laneY, css) +
    lamp('left', 'cone') +
    lamp('right', 'cone') +
    // A soft dark band down the middle, behind the chat, so its text reads easily.
    `<rect x="-4000" y="-4000" width="${n(G.viewW + 8000)}" height="9000" fill="url(#center-dim)"/>`

  css.push(
    `.runner{animation:claude-run ${look.runSeconds}s ease-in-out infinite}`,
    `@keyframes claude-run{0%,${p}%{transform:translateX(0px)}50%,${back}%{transform:translateX(${n(endX - startX)}px)}100%{transform:translateX(0px)}}`,
    `.facing{transform-box:fill-box;transform-origin:50% 100%;animation:claude-face ${look.runSeconds}s linear infinite}`,
    `@keyframes claude-face{0%,${p}%{transform:scaleX(-1)}${n(look.pause * 100 + flip)}%,${back}%{transform:scaleX(1)}${n(50 + look.pause * 100 + flip)}%,100%{transform:scaleX(-1)}}`,
    `.bob{transform-box:fill-box;transform-origin:50% 100%;animation:claude-bob ${n(Math.max(step, BOB_MIN_SECONDS))}s ease-in-out infinite}`,
    `.hbob{transform-box:fill-box;transform-origin:50% 100%;animation:helper-bob 0.5s ease-in-out infinite}`,
    `@keyframes helper-bob{0%,100%{transform:translateY(0px)}50%{transform:translateY(-3px)}}`,
    bobKeyframes(look.mood),
    `.leg{animation:claude-step ${n(step * 2)}s ease-in-out infinite}`,
    `.leg-b{animation-delay:-${n(step)}s}`,
    `@keyframes claude-step{0%,100%{transform:translateY(0px)}50%{transform:translateY(-5px)}}`,
    `.eyes{transform-box:fill-box;transform-origin:50% 50%;animation:claude-blink 4.5s ease-in-out infinite}`,
    `@keyframes claude-blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(0.1)}}`,
    `.arm{transform-box:fill-box;transform-origin:0% 50%;animation:claude-arm ${n(step * 2)}s ease-in-out infinite}`,
    `@keyframes claude-arm{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(10deg)}}`,
    `.flutter{transform-box:fill-box;transform-origin:50% 100%;animation:claude-flutter ${n(Math.max(step * 1.5, 0.45))}s ease-in-out infinite}`,
    `@keyframes claude-flutter{0%,100%{transform:rotate(-25deg)}50%{transform:rotate(25deg)}}`,
    `.sweat{animation:claude-sweat 0.9s ease-in infinite}`,
    `.sweat-late{animation-delay:-0.45s}`,
    `@keyframes claude-sweat{0%{transform:translateY(0px);opacity:1}100%{transform:translateY(16px);opacity:0}}`,
    `.speed{animation:claude-speed ${n(step * 2)}s linear infinite}`,
    `@keyframes claude-speed{0%,100%{transform:translateX(0px)}50%{transform:translateX(-6px)}}`,
    `.cab-pop{transform-box:fill-box;transform-origin:50% 100%;animation:cab-pop 0.55s cubic-bezier(0.3,1.6,0.5,1) both}`,
    `@keyframes cab-pop{0%{transform:scale(0,0)}100%{transform:scale(1,1)}}`,
    `.puff{transform-box:fill-box;transform-origin:50% 50%;animation:cab-puff 0.8s ease-out both}`,
    `@keyframes cab-puff{0%{opacity:0;transform:scale(0.4)}15%{opacity:0.55}100%{opacity:0;transform:scale(1.8)}}`,
    // A drawer sliding toward you grows away from the vanishing point.
    `.drawer{transform-box:view-box;transform-origin:${CX}px ${EYE_Y}px;animation-name:drawer-pop;animation-timing-function:ease-in-out;animation-iteration-count:infinite}`,
    `@keyframes drawer-pop{0%,55%,100%{transform:scale(1,1)}62%,82%{transform:scale(1.035,1.035)}}`,
    `.tips{animation-name:drawer-tips;animation-timing-function:ease-in-out;animation-iteration-count:infinite}`,
    `@keyframes drawer-tips{0%,55%,100%{transform:translateY(0px)}62%,82%{transform:translateY(-18px)}}`,
    `.hand{transform-box:fill-box;transform-origin:50% 100%;animation-name:clock-turn;animation-timing-function:linear;animation-iteration-count:infinite}`,
    `@keyframes clock-turn{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`,
    `.swing{transform-box:fill-box;transform-origin:50% 0%;animation:lamp-swing ${look.swingSeconds}s ease-in-out infinite alternate}`,
    `.swing-right{animation-delay:-${n(look.swingSeconds * 0.6)}s}`,
    `@keyframes lamp-swing{0%{transform:rotate(${-look.swing}deg)}100%{transform:rotate(${look.swing}deg)}}`,
    `.twinkle{animation:star-twinkle 4s ease-in-out infinite alternate}`,
    `@keyframes star-twinkle{0%{opacity:0.25}100%{opacity:0.9}}`,
    `.cloud{animation-name:cloud-drift;animation-timing-function:linear;animation-iteration-count:infinite}`,
    `@keyframes cloud-drift{0%{transform:translateX(0px)}100%{transform:translateX(260px)}}`,
    `.lightning{animation:storm-glow 9s ease-in-out infinite}`,
    `@keyframes storm-glow{0%,90%,100%{opacity:0}93%{opacity:0.28}}`,
    // Poses that stay in place, and their small motions.
    `.facing.still-left{animation:none;transform:scaleX(-1)}`,
    `.facing.still-right{animation:none;transform:none}`,
    `.dig{transform-box:fill-box;transform-origin:50% 0%;animation:claude-dig 0.36s ease-in-out infinite alternate}`,
    `.dig-late{animation-delay:-0.18s}`,
    `@keyframes claude-dig{0%{transform:rotate(-18deg) translateY(0px)}100%{transform:rotate(14deg) translateY(5px)}}`,
    // Binoculars pan to one side, hold, pan across to the other, hold, and come back.
    `.scan{transform-box:fill-box;transform-origin:50% 100%;animation:claude-scan 4s ease-in-out infinite}`,
    `@keyframes claude-scan{0%,100%{transform:translateX(0px) rotate(0deg)}15%,35%{transform:translateX(-7px) rotate(-7deg)}55%,80%{transform:translateX(7px) rotate(7deg)}}`,
    `.tap{animation:claude-tap 0.22s ease-in-out infinite alternate}`,
    `@keyframes claude-tap{0%{transform:translateY(0px)}100%{transform:translateY(4px)}}`,
    `.dot{animation:think-dot 1.5s ease-in-out infinite}`,
    `.dot-2{animation-delay:-1s}`,
    `.dot-3{animation-delay:-0.5s}`,
    `@keyframes think-dot{0%,100%{opacity:0.25}40%{opacity:1}}`,
  )

  // Lite mode: leave out the background's motion, so those parts stand still
  // where they are drawn. Claude and the helpers keep moving.
  const rules = LITE ? css.filter(rule => !LITE_STILL.some(part => rule.includes(part))) : css
  const dim = CENTER_DIM[state.dim]

  // The room fills the band panels leave uncovered, anchored to its bottom.
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' +
    `<style>${rules.join('')}</style>` +
    `<defs>${cabinetFrontDef()}` +
    `<linearGradient id="lamp-glow" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${COLORS.lampLight}" stop-opacity="0.2"/><stop offset="1" stop-color="${COLORS.lampLight}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<linearGradient id="center-dim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(G.viewW)}" y2="0">` +
    `<stop offset="0" stop-color="#000000" stop-opacity="0"/>` +
    `<stop offset="${CENTER_DIM_EDGE}" stop-color="#000000" stop-opacity="${dim}"/>` +
    `<stop offset="${1 - CENTER_DIM_EDGE}" stop-color="#000000" stop-opacity="${dim}"/>` +
    `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="${COLORS.ceiling}"/>` +
    `<svg x="${band.left}%" width="${100 - band.left - band.right}%" height="100%" viewBox="0 0 ${n(G.viewW)} 1000" preserveAspectRatio="xMidYMax meet">` +
    body +
    '</svg></svg>'
  )
}
