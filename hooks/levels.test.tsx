import { expect, test } from 'claude-code/testing'

import { ACTIONS, DIMS, LEVELS, LITE_MAX_HELPERS, MAX_HELPERS, clampFit, levelFor, levelOfScene, parseScene, sceneName } from './levels.js'
import { claude } from './claude.js'
import { BACK_DESKS, BACK_STACKS, FACES_AWAY, LITE_STILL, scene } from './scene.js'

test('percent maps to the six levels at the edges', async () => {
  expect(levelFor(undefined)).toBe(1)
  expect(levelFor(0)).toBe(1)
  expect(levelFor(14)).toBe(1)
  expect(levelFor(15)).toBe(2)
  expect(levelFor(34)).toBe(2)
  expect(levelFor(35)).toBe(3)
  expect(levelFor(55)).toBe(4)
  expect(levelFor(75)).toBe(5)
  expect(levelFor(89)).toBe(5)
  expect(levelFor(90)).toBe(6)
  expect(levelFor(100)).toBe(6)
})

test('scene names round-trip and stay in the allowed alphabet', async () => {
  for (const level of LEVELS) {
    for (const action of ACTIONS) {
      const state = { level, fit: { left: 18, right: 35 }, helpers: MAX_HELPERS, action, pop: false, lite: level % 2 === 0, dim: DIMS[level % 3] ?? ('medium' as const) }
      const name = sceneName(state)
      expect(/^[A-Za-z0-9_-]{1,64}$/.test(name)).toBe(true)
      expect(parseScene(name)).toEqual(state)
    }
  }
  expect(levelOfScene('something-else')).toBe(1)
  // Older names still read: missing parts take the defaults.
  expect(parseScene('office-5')).toEqual({ level: 5, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: true, lite: false, dim: 'medium' })
  expect(parseScene('office-2-l10-r0')).toEqual({ level: 2, fit: { left: 10, right: 0 }, helpers: 0, action: 'file', pop: true, lite: false, dim: 'medium' })
  expect(parseScene(sceneName({ level: 3, helpers: 40 })).helpers).toBe(MAX_HELPERS)
  expect(clampFit({ left: 60, right: 60 })).toEqual({ left: 60, right: 10 })
})

test('every scene avoids what bug reports say freezes them', async () => {
  for (const level of LEVELS) {
    for (const action of ACTIONS) {
      const svg = scene({ level, fit: { left: 0, right: 0 }, helpers: MAX_HELPERS, action, pop: true, lite: false, dim: 'medium' })
      expect(svg.includes('shape-rendering')).toBe(false)
      expect(svg.includes('@media')).toBe(false)
      expect(svg.includes('<image')).toBe(false)
      expect(svg.includes('<animate')).toBe(false)
      expect(svg.length < 131072).toBe(true)
      for (const [, id] of svg.matchAll(/id="([^"]*)"/g)) expect(String(id).includes('-')).toBe(true)
    }
  }
})

test('the office fills up as levels rise', async () => {
  let cabinets = 0
  for (const level of LEVELS) {
    const count = scene(level).split('href="#cab-front"').length - 1
    expect(count > cabinets).toBe(true)
    cabinets = count
  }
})

test('cabinets pop in only when the scene asks', async () => {
  expect(scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: true, lite: false, dim: 'medium' }).includes('class="cab-pop"')).toBe(true)
  expect(scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: false, lite: false, dim: 'medium' }).includes('class="cab-pop"')).toBe(false)
})

test('one helper mascot is drawn per helper', async () => {
  for (let helpers = 0; helpers <= MAX_HELPERS; helpers++) {
    const svg = scene({ level: 3, fit: { left: 0, right: 0 }, helpers, action: 'file', pop: false, lite: false, dim: 'medium' })
    expect((svg.match(/class="hr-\d"/g) ?? []).length).toBe(helpers)
  }
})

test('each action draws its own pose', async () => {
  const draw = (action: (typeof ACTIONS)[number]) => scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action, pop: false, lite: false, dim: 'medium' })
  expect(draw('file').includes('class="runner"')).toBe(true)
  expect(draw('read').includes('class="dig')).toBe(true)
  expect(draw('write').includes('class="feed"')).toBe(true)
  expect(draw('think').includes('dot-3')).toBe(true)
  for (const action of ['read', 'write', 'web', 'think'] as const) expect(draw(action).includes('class="runner"')).toBe(false)
})

test('Claude shows no face when turned away, and its face otherwise', async () => {
  for (const mood of ['calm', 'stressed', 'chaos'] as const) {
    const away = claude(mood, { pose: 'rummage', back: true })
    expect(away.includes('class="eyes"')).toBe(false)
    expect(away.includes('rotate(14 -15 -50)')).toBe(false) // no brows
    expect(claude(mood, { pose: 'rummage' }).includes('class="eyes"')).toBe(true)
  }
  // Only rummaging faces away; filing, typing, looking out and thinking face you.
  expect([...FACES_AWAY]).toEqual(['read'])
  const draw = (action: (typeof ACTIONS)[number]) =>
    scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action, pop: false, lite: false, dim: 'medium' })
  const eyesIn = (action: (typeof ACTIONS)[number]) => draw(action).split('class="eyes"').length - 1
  expect(eyesIn('read')).toBe(0)
  expect(eyesIn('think')).toBe(1)
  // Looking out: the same binoculars, facing you, panning left and right.
  expect(draw('web').includes('#9fc4ff')).toBe(true)
  expect(draw('web').includes('class="scan"')).toBe(true)
  expect(draw('web').includes('@keyframes claude-scan')).toBe(true)
  expect(draw('web').includes('rotate(14 -15 -50)')).toBe(true) // stressed brows show at level 4
})

test('cabinets pile up along the far wall as levels rise, with no papers or drawers', async () => {
  let previous = -1
  for (const level of LEVELS) {
    const total = BACK_STACKS[level].left.concat(BACK_STACKS[level].right).reduce((a, b) => a + b, 0)
    expect(total >= previous).toBe(true)
    previous = total
    const svg = scene({ level, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: false, lite: false, dim: 'medium' })
    expect((svg.match(/<use href="#cab-front" transform=/g) ?? []).length).toBe(total)
  }
  expect(previous > 0).toBe(true)
})

for (const surface of ['desktop', 'mobile'] as const) {
  test('the Backdrop draws the named scene on ' + surface, async $ => {
    for (const level of LEVELS) {
      const state = { level, fit: { left: 0, right: 20 }, helpers: 2, action: 'read' as const, pop: false, lite: false, dim: 'medium' as const }
      const ui = await $.ui.mount({
        plugin: 'office-worker-claude',
        surface,
        component: 'Backdrop',
        props: { scene: sceneName(state), plugin: 'office-worker-claude', glass: { blur: 2, opacity: 0.3 } },
      })
      const svg = await ui.find({ type: 'Svg' })
      expect(svg).toBeDefined()
      expect(svg?.props.source).toBe(scene(state))
      await ui.unmount()
    }
  })
}

test('another plugin\'s backdrop is left alone', async $ => {
  const ui = await $.ui.mount({
    plugin: 'office-worker-claude',
    surface: 'desktop',
    component: 'Backdrop',
    props: { scene: sceneName({ level: 3 }), plugin: 'someone-else', glass: false },
  })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('/office previews a level, follows again, and fits', async ($, on) => {
  const scenes: string[] = []
  on('theme.set', (_, e) => {
    if (e.backdrop && 'scene' in e.backdrop) scenes.push(String(e.backdrop.scene))
    return { value: { isDrawn: true, requestId: 'test' } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 80000, percent: 40 }, rateLimits: [] } }))
  on('clock.now', () => ({ value: 0 }))
  const run = (args: string) =>
    $.command.run({ command: 'office', args, origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 80 } } as never)

  const preview = await run('4')
  expect(String(preview.text).includes('level 4')).toBe(true)
  const auto = await run('auto')
  expect(String(auto.text).includes('40% is level 3')).toBe(true)
  const bad = await run('9')
  expect(String(bad.text).startsWith('Usage')).toBe(true)
  const fitted = await run('fit 20 35')
  expect(String(fitted.text).includes('20% on the left')).toBe(true)
  // Pop-in only on the first drawing; going down a level or refitting does not pop.
  expect(scenes).toEqual(['office-4-l0-r0-w0-file-p1-m0-d1', 'office-3-l0-r0-w0-file-p0-m0-d1', 'office-3-l20-r35-w0-file-p0-m0-d1'])
})

const stateFor = (lite: boolean) => ({ level: 6 as const, fit: { left: 0, right: 0 }, helpers: MAX_HELPERS, action: 'file' as const, pop: false, lite, dim: 'medium' as const })

test('lite mode stills the background but keeps Claude moving', async () => {
  const full = scene(stateFor(false))
  const lite = scene(stateFor(true))
  const style = (svg: string) => svg.slice(svg.indexOf('<style>'), svg.indexOf('</style>'))
  // Whatever background motion the full scene has, lite leaves out. (Stars
  // twinkle only on clear nights, so a storm has none to leave out.)
  for (const part of LITE_STILL) expect(style(lite).includes(part)).toBe(false)
  for (const part of ['rain-', 'lightning', 'swing', 'sway', 'tw-feed', 'print-out', '.hand']) expect(style(full).includes(part)).toBe(true)
  // Claude still runs, steps and bobs.
  for (const rule of ['claude-run', 'claude-step', 'claude-bob']) expect(style(lite).includes(rule)).toBe(true)
  // No flying papers or popping drawers, and fewer helpers.
  expect(lite.includes('class="fly-')).toBe(false)
  expect(lite.includes('class="drawer"')).toBe(false)
  expect((lite.match(/class="hr-\d"/g) ?? []).length).toBe(LITE_MAX_HELPERS)
  expect(lite.length < full.length).toBe(true)
})

test('the middle darkens more with each dim setting', async () => {
  const strength = (dim: (typeof DIMS)[number]) => {
    const svg = scene({ ...stateFor(false), dim })
    const stops = svg.slice(svg.indexOf('id="center-dim"')).match(/stop-opacity="([0-9.]+)"/g) ?? []
    return Number(String(stops[1]).replace(/[^0-9.]/g, ''))
  }
  expect(strength('light') < strength('medium')).toBe(true)
  expect(strength('medium') < strength('strong')).toBe(true)
})

test('the back desks carry typewriters and printers as well as lamps and plants', async () => {
  const kits = BACK_DESKS.flatMap(d => d.kit)
  for (const item of ['typewriter', 'printer', 'lamp', 'plant', 'papers'] as const) expect(kits.includes(item)).toBe(true)
  const svg = scene(stateFor(false))
  expect(svg.includes('class="tw-feed"')).toBe(true)
  expect(svg.includes('class="print-out"')).toBe(true)
})

test('/office lite on and off switch the scene and the glass', async ($, on) => {
  const sets: Array<{ scene: string; blur: number }> = []
  on('theme.set', (_, e) => {
    if (e.backdrop && 'scene' in e.backdrop) {
      const glass = e.backdrop.glass
      sets.push({ scene: String(e.backdrop.scene), blur: glass ? Number(glass.blur) : -1 })
    }
    return { value: { isDrawn: true, requestId: 'test' } }
  })
  on('clock.now', () => ({ value: 0 }))
  const run = (args: string) =>
    $.command.run({ command: 'office', args, origin: { kind: 'plugin', name: 'test' }, presentation: { isFullscreen: false, columns: 80 } } as never)
  expect(String((await run('lite on')).text).includes('Lite mode is on')).toBe(true)
  expect(String((await run('lite off')).text).includes('Lite mode is off')).toBe(true)
  expect(sets.map(s => s.scene.endsWith('-m1-d1'))).toEqual([true, false])
  expect(sets.map(s => s.blur)).toEqual([0, 4])
})
