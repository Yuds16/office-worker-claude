import type { EngineInterface, Register } from 'claude-code'

import {
  FULL_WINDOW,
  clampFit,
  clampHelpers,
  isLevel,
  levelFor,
  parseScene,
  sceneName,
  type Action,
  type Fit,
  type Level,
} from './levels.js'
import { scene } from './scene.js'

// Light glass so the office shows beside the chat. Raise opacity if text
// gets hard to read; raise blur to soften the scene behind the panels.
const GLASS = { blur: 2, opacity: 0.3 }

/**
 * Fewest milliseconds between two backdrop swaps. Each swap reloads the
 * scene, and a scene redrawn more often than every five seconds is held
 * still for people who asked for reduced motion, so changes that arrive
 * sooner wait and the latest one is drawn.
 */
const MIN_SWAP_MS = 5000

/**
 * Which main-thread tools set which action. Shell tools are left out on
 * purpose: hooking a tool call turns off its move to the background and its
 * live output, which matter for Bash and PowerShell.
 */
const TOOL_ACTIONS: Record<string, Action> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  Edit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  WebFetch: 'web',
  WebSearch: 'web',
}

// Module variables start over on a reload; session.start sets the theme
// again from live usage. `contextLevel` follows the context, `preview` is a
// level pinned by /office, `fit` is set by /office fit, `helpers` holds the
// subagents in a turn, `action` is the main Claude's current pose.
let contextLevel: Level = 1
let preview: Level | undefined
let fit: Fit = FULL_WINDOW
const helpers = new Set<string>()
let action: Action = 'file'

// What was last drawn and when, a pending swap waiting out the gap, and
// whether this copy of the module has drawn its first scene yet.
let drawnName: string | undefined
let drawnLevel: Level = 1
let lastSwapAt = Number.NEGATIVE_INFINITY
let pending: { cancel: () => void } | undefined
let ready = false
let lastNotDrawn: string | undefined

function shownLevel(): Level {
  return preview ?? contextLevel
}

/** The scene name for the current state, before deciding on pop-in. */
function wanted(pop: boolean): string {
  return sceneName({ level: shownLevel(), fit, helpers: clampHelpers(helpers.size), action, pop })
}

function isShown(): boolean {
  return drawnName !== undefined && wanted(false) === withoutPop(drawnName)
}

/**
 * Draws the current state now, or once the swap gap has passed. The decision
 * and the bookkeeping happen together after the one await, so refreshes that
 * arrive at the same moment cannot both swap: the first claims the slot, the
 * rest find it taken and leave one pending swap to catch up.
 */
async function refresh($: EngineInterface, force = false) {
  // Before session.start has drawn, other events wait: they would draw with
  // a level not yet read from the context.
  if (!ready && !force) return
  if (isShown()) return
  const now = await $.clock.now()
  if (isShown()) return
  const wait = force ? 0 : MIN_SWAP_MS - (now - lastSwapAt)
  if (wait > 0) {
    pending ??= $.clock.after(wait, () => {
      pending = undefined
      refreshLater($)
    })
    return
  }
  pending?.cancel()
  pending = undefined
  const level = shownLevel()
  // Cabinets pop in only when the level rose since the last drawing.
  const name = wanted(drawnName === undefined || level > drawnLevel)
  drawnName = name
  drawnLevel = level
  lastSwapAt = now
  const set = await $.theme.set({ backdrop: { scene: name, glass: GLASS }, overrideColorScheme: 'dark' })
  // Say why it is not drawn once per reason, not on every swap (a terminal
  // session or a closed window has no client that draws themes).
  const reason = set.isDrawn ? undefined : String(set.reason)
  if (reason !== undefined && reason !== lastNotDrawn) $.ui.log('office-worker-claude: theme not drawn: ' + reason)
  lastNotDrawn = reason
}

function withoutPop(name: string): string {
  return name.replace(/-p[01]$/, '-p0')
}

/** Refreshes without holding up the caller; a failure only leaves the old scene up. */
function refreshLater($: EngineInterface) {
  refresh($).catch(error => $.ui.log('office-worker-claude: refresh failed: ' + String(error)))
}

/** Sets the main Claude's pose from a main-thread tool call. */
function pose($: EngineInterface, tool: string, agentId: string | undefined) {
  const wanted_action = TOOL_ACTIONS[tool]
  if (agentId !== undefined || wanted_action === undefined || wanted_action === action) return
  action = wanted_action
  refreshLater($)
}

const USAGE =
  'Usage: /office 1 to 6 previews a level; /office auto follows the real context; ' +
  '/office fit <left%> <right%> fits the room beside open panels (/office fit 0 0 for the whole window).'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Preview an office level (1-6), follow the context (auto), or fit the room beside panels (fit)',
      argumentHint: '[1-6|auto|fit <left%> <right%>]',
    })
    action = 'file'
    drawnName = undefined
    const { context } = await $.session.usage()
    contextLevel = levelFor(context.percent)
    // After a reload, pick up subagents already at work. Workflow agents are
    // not listed there; their next turn adds them.
    helpers.clear()
    for (const agent of await $.agent.list()) {
      if (agent.status === 'running') helpers.add(agent.id)
    }
    await refresh($, true)
    ready = true
    return next(e)
  })

  // Fires after each main-thread turn with the same figures as usage().
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      contextLevel = levelFor(e.context.percent)
      if (preview === undefined) await refresh($)
    }
    return next(e)
  })

  // A turn with an agentId is a subagent, teammate or workflow agent at work:
  // each one in a turn is a helper mascot. The main thread's turn sets Claude
  // thinking at its start and back to filing at its end.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) helpers.add(e.agentId)
    else action = 'think'
    refreshLater($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) helpers.delete(e.agentId)
    else action = 'file'
    refreshLater($)
    return next(e)
  })

  // Main-thread tool calls pick Claude's pose. Each hook only notes the tool
  // and passes the call straight on; the swap happens off the call's path.
  // One hook per tool, so each matcher is a literal validate can read.
  on('tool.call', { tool: 'Read' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'Grep' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'Glob' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'Edit' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'Write' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'NotebookEdit' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'WebFetch' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))
  on('tool.call', { tool: 'WebSearch' }, ($, e, next) => (pose($, e.tool, e.agentId), next(e)))

  on('command.run', { command: 'office' }, async ($, e) => {
    const [word = '', ...rest] = e.args.trim().toLowerCase().split(/\s+/)
    let text: string
    if (word === 'auto') {
      preview = undefined
      const { context } = await $.session.usage()
      contextLevel = levelFor(context.percent)
      await refresh($, true)
      text = `Following the real context again: ${context.percent ?? 0}% is level ${contextLevel}.`
    } else if (word === 'fit') {
      const [left = '0', right = '0'] = rest
      fit = clampFit({ left: Number(left), right: Number(right) })
      await refresh($, true)
      text =
        fit.left === 0 && fit.right === 0
          ? 'The room fills the whole window again.'
          : `The room now fits between ${fit.left}% on the left and ${fit.right}% on the right.`
    } else if (word !== '' && isLevel(Number(word))) {
      preview = Number(word) as Level
      await refresh($, true)
      text = `Previewing level ${preview}. Run /office auto to follow the real context again.`
    } else if (word === '') {
      const { context } = await $.session.usage()
      const state =
        preview !== undefined
          ? `Previewing level ${preview} (context is at ${context.percent ?? 0}%).`
          : `Following the context: ${context.percent ?? 0}% is level ${levelFor(context.percent)}.`
      text = `${state} Fit: ${fit.left}% left, ${fit.right}% right. Helpers working: ${helpers.size}.`
    } else {
      text = USAGE
    }
    return { text, isTextDisplayOnly: true }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    if (e.props.plugin !== $.plugin.name) return next(e)
    const { Svg } = $.ui.resolve(e)
    const state = parseScene(e.props.scene)
    return <Svg source={scene(state)} alt={'A filing office, level ' + state.level + ' of 6'} isInteractive />
  })
}
