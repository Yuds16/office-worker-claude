import { expect, test } from 'claude-code/testing'

import { ACTIONS, LEVELS, MAX_HELPERS, clampFit, levelFor, levelOfScene, parseScene, sceneName } from './levels.js'
import { scene } from './scene.js'

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
      const state = { level, fit: { left: 18, right: 35 }, helpers: MAX_HELPERS, action, pop: false }
      const name = sceneName(state)
      expect(/^[A-Za-z0-9_-]{1,64}$/.test(name)).toBe(true)
      expect(parseScene(name)).toEqual(state)
    }
  }
  expect(levelOfScene('something-else')).toBe(1)
  // Older names still read: missing parts take the defaults.
  expect(parseScene('office-5')).toEqual({ level: 5, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: true })
  expect(parseScene('office-2-l10-r0')).toEqual({ level: 2, fit: { left: 10, right: 0 }, helpers: 0, action: 'file', pop: true })
  expect(parseScene(sceneName({ level: 3, helpers: 40 })).helpers).toBe(MAX_HELPERS)
  expect(clampFit({ left: 60, right: 60 })).toEqual({ left: 60, right: 10 })
})

test('every scene avoids what bug reports say freezes them', async () => {
  for (const level of LEVELS) {
    for (const action of ACTIONS) {
      const svg = scene({ level, fit: { left: 0, right: 0 }, helpers: MAX_HELPERS, action, pop: true })
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
  expect(scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: true }).includes('class="cab-pop"')).toBe(true)
  expect(scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action: 'file', pop: false }).includes('class="cab-pop"')).toBe(false)
})

test('one helper mascot is drawn per helper', async () => {
  for (let helpers = 0; helpers <= MAX_HELPERS; helpers++) {
    const svg = scene({ level: 3, fit: { left: 0, right: 0 }, helpers, action: 'file', pop: false })
    expect((svg.match(/class="hr-\d"/g) ?? []).length).toBe(helpers)
  }
})

test('each action draws its own pose', async () => {
  const draw = (action: (typeof ACTIONS)[number]) => scene({ level: 4, fit: { left: 0, right: 0 }, helpers: 0, action, pop: false })
  expect(draw('file').includes('class="runner"')).toBe(true)
  expect(draw('read').includes('class="dig')).toBe(true)
  expect(draw('write').includes('class="feed"')).toBe(true)
  expect(draw('web').includes('#9fc4ff')).toBe(true)
  expect(draw('think').includes('dot-3')).toBe(true)
  for (const action of ['read', 'write', 'web', 'think'] as const) expect(draw(action).includes('class="runner"')).toBe(false)
})

for (const surface of ['desktop', 'mobile'] as const) {
  test('the Backdrop draws the named scene on ' + surface, async $ => {
    for (const level of LEVELS) {
      const state = { level, fit: { left: 0, right: 20 }, helpers: 2, action: 'read' as const, pop: false }
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
  expect(scenes).toEqual(['office-4-l0-r0-w0-file-p1', 'office-3-l0-r0-w0-file-p0', 'office-3-l20-r35-w0-file-p0'])
})
