// The context levels, how a fill percentage maps to one, and the scene name
// that carries everything a scene draws: level, fit, helpers and action.
// What each level looks like lives in scene.ts (LEVEL_LOOKS).

export type Level = 1 | 2 | 3 | 4 | 5 | 6

export const LEVELS: readonly Level[] = [1, 2, 3, 4, 5, 6]

// Lower edge, in percent, of levels 2 to 6. Level 1 is everything below the
// first. Lower these (say [1, 2, 3, 4, 5]) to watch the office fill quickly.
export const LEVEL_THRESHOLDS: readonly number[] = [15, 35, 55, 75, 90]

/** How much of the window, in percent, panels cover on the left and right. */
export type Fit = { left: number; right: number }

export const FULL_WINDOW: Fit = { left: 0, right: 0 }

/**
 * What the main Claude is doing. `file` is the default run between stacks;
 * the rest come from the tool the main thread is calling (see register.tsx).
 */
export type Action = 'file' | 'read' | 'write' | 'web' | 'think'

export const ACTIONS: readonly Action[] = ['file', 'read', 'write', 'web', 'think']

/** Most helper mascots drawn, however many subagents run. */
export const MAX_HELPERS = 6

/** Most helper mascots drawn in lite mode. */
export const LITE_MAX_HELPERS = 2

/** How much the scene darkens behind the chat. */
export type Dim = 'light' | 'medium' | 'strong'

export const DIMS: readonly Dim[] = ['light', 'medium', 'strong']

export type SceneState = {
  level: Level
  fit: Fit
  /** Helper mascots: subagents currently working, capped at MAX_HELPERS. */
  helpers: number
  action: Action
  /** Whether cabinets new at this level pop in: only when the level just rose. */
  pop: boolean
  /** Lite mode: Claude still moves, the background holds still. */
  lite: boolean
  dim: Dim
  /**
   * The action drawn just before, when it differs: the scene opens with a
   * short move from that pose into this one instead of cutting straight to it.
   */
  from?: Action
  /** When coming from filing: how far along the run Claude was, 0 (left stack) to 100 (right stack). */
  fromX?: number
}

export const DEFAULT_STATE: SceneState = {
  level: 1,
  fit: FULL_WINDOW,
  helpers: 0,
  action: 'file',
  pop: true,
  lite: false,
  dim: 'medium',
}

// percent is absent until the first response of the live window (a fresh
// or just-compacted session); treat that as level 1.
export function levelFor(percent: number | undefined): Level {
  if (percent === undefined) return 1
  let level = 1
  for (const edge of LEVEL_THRESHOLDS) if (percent >= edge) level++
  return Math.min(level, 6) as Level
}

export function isLevel(n: number): n is Level {
  return Number.isInteger(n) && n >= 1 && n <= 6
}

/** Keeps a fit sane: whole percents, each side 0 to 70, at least 30% left uncovered. */
export function clampFit(fit: Fit): Fit {
  const side = (v: number) => Math.max(0, Math.min(70, Math.round(Number.isFinite(v) ? v : 0)))
  const left = side(fit.left)
  let right = side(fit.right)
  if (left + right > 70) right = 70 - left
  return { left, right }
}

export function clampHelpers(n: number): number {
  return Math.max(0, Math.min(MAX_HELPERS, Math.round(Number.isFinite(n) ? n : 0)))
}

/** The scene name: letters, digits and hyphens, well under 64 characters. */
export function sceneName(state: Partial<SceneState> & { level: Level }): string {
  const s = { ...DEFAULT_STATE, ...state }
  const { left, right } = clampFit(s.fit)
  const dim = Math.max(0, DIMS.indexOf(s.dim))
  const base = `office-${s.level}-l${left}-r${right}-w${clampHelpers(s.helpers)}-${s.action}-p${s.pop ? 1 : 0}-m${s.lite ? 1 : 0}-d${dim}`
  if (s.from === undefined || s.from === s.action) return base
  return base + `-f${s.from}` + (s.from === 'file' ? `-x${clampRun(s.fromX)}` : '')
}

/** A run position as a whole percent, 0 to 100. */
export function clampRun(x: number | undefined): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(x) ? Number(x) : 0)))
}

/** The scene name without its opening move or pop-in: what stays on screen once both are over. */
export function steadyName(name: string): string {
  return name.replace(/-p[01](?=-|$)/, '-p0').replace(/-f[a-z]+(-x\d+)?$/, '')
}

/** Reads a scene name back; anything missing or unknown takes the default. */
export function parseScene(scene: string): SceneState {
  const m = /^office-(\d)(?:-l(\d+)-r(\d+))?(?:-w(\d+))?(?:-([a-z]+))?(?:-p([01]))?(?:-m([01]))?(?:-d([0-2]))?(?:-f([a-z]+))?(?:-x(\d+))?$/.exec(scene)
  const level = Number(m?.[1])
  const action = m?.[5] as Action | undefined
  const from = m?.[9] as Action | undefined
  const state: SceneState = {
    level: isLevel(level) ? level : 1,
    fit: clampFit({ left: Number(m?.[2] ?? 0), right: Number(m?.[3] ?? 0) }),
    helpers: clampHelpers(Number(m?.[4] ?? 0)),
    action: action !== undefined && ACTIONS.includes(action) ? action : 'file',
    pop: m?.[6] !== '0',
    lite: m?.[7] === '1',
    dim: DIMS[Number(m?.[8] ?? 1)] ?? 'medium',
  }
  if (from !== undefined && ACTIONS.includes(from) && from !== state.action) {
    state.from = from
    if (from === 'file') state.fromX = clampRun(Number(m?.[10] ?? 0))
  }
  return state
}

export function levelOfScene(scene: string): Level {
  return parseScene(scene).level
}
