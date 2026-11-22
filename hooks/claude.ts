// Claude: a chunky, blocky critter seen a little from above, with two tall
// eyes, nub arms and four stubby legs. Drawn with its feet at (0, 0), facing
// right; the scene flips it to face left. A mood picks the face; a pose picks
// what the arms are doing. A new state is a new Mood or Pose and a branch here.

export type Mood = 'calm' | 'busy' | 'stressed' | 'panic' | 'chaos'

/**
 * carry: a paper in hand (arms up in chaos). rummage: both arms digging into
 * a drawer. type: tapping at a desk. binoculars: looking out through them.
 * think: arms down, a thought bubble overhead.
 */
export type Pose = 'carry' | 'rummage' | 'type' | 'binoculars' | 'think'

export const CLAUDE_COLORS = {
  body: '#d97757',
  top: '#ec9a7c',
  side: '#a9553b',
  eye: '#1f1512',
  sweat: '#8fd3ff',
  paper: '#f2ede2',
  paperInk: '#9a9284',
}

/** Half of Claude's width with arms, in its own units. */
export const CLAUDE_HALF = 50

export const PAPER_SHAPE =
  `<rect x="-8" y="-10" width="16" height="20" rx="1" fill="${CLAUDE_COLORS.paper}"/>` +
  `<path d="M-5 -5H5M-5 0H5M-5 5H2" stroke="${CLAUDE_COLORS.paperInk}" stroke-width="1.5"/>`

function eyes(mood: Mood): string {
  const ink = CLAUDE_COLORS.eye
  if (mood === 'panic' || mood === 'chaos') {
    const big = mood === 'chaos' ? 2 : 0
    return (
      `<g class="eyes">` +
      `<rect x="${-20 - big}" y="${-46 - big}" width="${11 + big * 2}" height="${13 + big * 2}" fill="#ffffff"/>` +
      `<rect x="${8 - big}" y="${-46 - big}" width="${11 + big * 2}" height="${13 + big * 2}" fill="#ffffff"/>` +
      `<rect x="-15" y="-42" width="4" height="5" fill="${ink}"/><rect x="13" y="-42" width="4" height="5" fill="${ink}"/></g>`
    )
  }
  return `<g class="eyes"><rect x="-17" y="-45" width="6" height="12" fill="${ink}"/><rect x="10" y="-45" width="6" height="12" fill="${ink}"/></g>`
}

function nub(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/><rect x="${x}" y="${y}" width="${w}" height="3" fill="${CLAUDE_COLORS.top}"/>`
}

function arms(mood: Mood, pose: Pose): string {
  const { body: O, side, eye: ink } = CLAUDE_COLORS
  switch (pose) {
    case 'rummage':
      // Both arms reach forward and down into the drawer, digging.
      return (
        `<g class="dig">${nub(33, -32, 14, 10, O)}</g>` +
        `<g class="dig dig-late">${nub(-47, -32, 14, 10, side)}</g>`
      )
    case 'type':
      // The front arm taps; the back arm rests.
      // Raised to the typewriter on the desk in front.
      return nub(-45, -30, 12, 10, side) + `<g class="tap">${nub(33, -62, 18, 9, O)}</g>`
    case 'binoculars':
      // Arms up holding binoculars over the eyes.
      return (
        nub(-31, -46, 10, 14, O) +
        nub(21, -46, 10, 14, O) +
        `<rect x="-22" y="-50" width="15" height="16" rx="3" fill="#2a2a2e"/>` +
        `<rect x="5" y="-50" width="15" height="16" rx="3" fill="#2a2a2e"/>` +
        `<rect x="-7" y="-46" width="12" height="6" fill="#2a2a2e"/>` +
        `<rect x="-18" y="-46" width="5" height="4" fill="#9fc4ff" opacity="0.7"/>` +
        `<rect x="9" y="-46" width="5" height="4" fill="#9fc4ff" opacity="0.7"/>`
      )
    case 'think':
      return (
        nub(-43, -26, 10, 12, side) +
        nub(33, -26, 10, 12, O) +
        // A thought bubble with three dots that light in turn.
        `<circle cx="28" cy="-70" r="3" fill="#ffffff" opacity="0.85"/>` +
        `<circle cx="38" cy="-82" r="5" fill="#ffffff" opacity="0.85"/>` +
        `<ellipse cx="62" cy="-104" rx="26" ry="16" fill="#ffffff" opacity="0.92"/>` +
        `<circle class="dot dot-1" cx="50" cy="-104" r="3.5" fill="${ink}"/>` +
        `<circle class="dot dot-2" cx="62" cy="-104" r="3.5" fill="${ink}"/>` +
        `<circle class="dot dot-3" cx="74" cy="-104" r="3.5" fill="${ink}"/>`
      )
    case 'carry':
      if (mood === 'chaos') {
        // Arms up, a paper flapping overhead.
        return (
          nub(-45, -66, 10, 18, O) +
          nub(35, -66, 10, 18, O) +
          `<g transform="translate(42 -76)"><g class="flutter">${PAPER_SHAPE}</g></g>`
        )
      }
      return (
        `<rect x="-45" y="-36" width="12" height="10" fill="${side}"/>` +
        `<g class="arm">${nub(33, -36, 12, 10, O)}` +
        `<g transform="translate(50 -34) rotate(10)">${PAPER_SHAPE}</g></g>`
      )
  }
}

export function claude(mood: Mood, options: { pose?: Pose; facing?: string; bob?: string } = {}): string {
  const { pose = 'carry', facing = '', bob = 'bob' } = options
  const { body: O, top, side, eye: ink } = CLAUDE_COLORS
  const brows =
    mood === 'stressed' || mood === 'panic' || mood === 'chaos'
      ? `<rect x="-21" y="-52" width="12" height="3" fill="${ink}" transform="rotate(14 -15 -50)"/>` +
        `<rect x="8" y="-52" width="12" height="3" fill="${ink}" transform="rotate(-14 14 -50)"/>`
      : ''
  const mouth =
    mood === 'chaos'
      ? `<rect x="-6" y="-28" width="12" height="9" fill="${ink}"/>`
      : mood === 'panic'
        ? `<rect x="-4" y="-27" width="8" height="5" fill="${ink}"/>`
        : ''
  const sweat =
    mood === 'panic' || mood === 'chaos'
      ? `<path class="sweat" d="M-36 -64q-5 8 0 11q5 -3 0 -11z" fill="${CLAUDE_COLORS.sweat}"/>` +
        (mood === 'chaos' ? `<path class="sweat sweat-late" d="M44 -60q-4 7 0 10q4 -3 0 -10z" fill="${CLAUDE_COLORS.sweat}"/>` : '')
      : ''
  const speedLines =
    pose === 'carry' && (mood === 'panic' || mood === 'chaos')
      ? `<path class="speed" d="M-52 -48H-70M-50 -36H-74M-52 -24H-68" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.35"/>`
      : ''
  return (
    `<g class="facing ${facing}">` +
    `<rect x="-80" y="-100" width="160" height="105" fill="none"/>` +
    `<ellipse cx="3" cy="1" rx="42" ry="6" fill="#000000" opacity="0.4"/>` +
    speedLines +
    `<g class="leg leg-a"><rect x="-28" y="-12" width="7" height="12" fill="${side}"/><rect x="10" y="-12" width="7" height="12" fill="${side}"/></g>` +
    `<g class="leg leg-b"><rect x="-16" y="-12" width="7" height="12" fill="${side}"/><rect x="22" y="-12" width="7" height="12" fill="${side}"/></g>` +
    `<g class="${bob}">` +
    // Body as a little box: top, side, then front.
    `<polygon points="-33,-54 -27,-60 39,-60 33,-54" fill="${top}"/>` +
    `<polygon points="33,-54 39,-60 39,-18 33,-12" fill="${side}"/>` +
    `<rect x="-33" y="-54" width="66" height="42" fill="${O}"/>` +
    `<rect x="-33" y="-18" width="66" height="6" fill="#000000" opacity="0.14"/>` +
    eyes(mood) +
    brows +
    mouth +
    arms(mood, pose) +
    sweat +
    `</g></g>`
  )
}
