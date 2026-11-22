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

export type SceneState = {
  level: Level
  fit: Fit
  /** Helper mascots: subagents currently working, capped at MAX_HELPERS. */
  helpers: number
  action: Action
  /** Whether cabinets new at this level pop in: only when the level just rose. */
  pop: boolean
}

export const DEFAULT_STATE: SceneState = { level: 1, fit: FULL_WINDOW, helpers: 0, action: 'file', pop: true }

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
  return `office-${s.level}-l${left}-r${right}-w${clampHelpers(s.helpers)}-${s.action}-p${s.pop ? 1 : 0}`
}

/** Reads a scene name back; anything missing or unknown takes the default. */
export function parseScene(scene: string): SceneState {
  const m = /^office-(\d)(?:-l(\d+)-r(\d+))?(?:-w(\d+))?(?:-([a-z]+))?(?:-p([01]))?$/.exec(scene)
  const level = Number(m?.[1])
  const action = m?.[5] as Action | undefined
  return {
    level: isLevel(level) ? level : 1,
    fit: clampFit({ left: Number(m?.[2] ?? 0), right: Number(m?.[3] ?? 0) }),
    helpers: clampHelpers(Number(m?.[4] ?? 0)),
    action: action !== undefined && ACTIONS.includes(action) ? action : 'file',
    pop: m?.[6] !== '0',
  }
}

export function levelOfScene(scene: string): Level {
  return parseScene(scene).level
}
