# office-worker-claude

A mod for the Claude Code desktop app that puts an animated filing office behind
your conversation. A small, blocky orange Claude works there, and the office
reacts to what your session is doing:

- **As the context window fills,** filing cabinets pop in along the walls, the
  weather in the windows turns from a clear night to a storm, the pendant lamps
  swing harder, the clock spins faster, and Claude goes from calmly filing to
  sprinting with its arms in the air.
- **When subagents work** (the Agent tool, workflows, teammates), a small helper
  mascot joins for each one, up to six, each running its own lane.
- **When Claude calls a tool,** it does something different: rummages through a
  pulled-out drawer for reads and searches, types at a desk for edits, looks out
  through binoculars for web tools, and thinks with a bubble at the start of a turn.

Everything is drawn in one-point perspective, with desks, desk lamps and potted
plants along the far wall, and the center of the window stays clear for the chat.

## The six levels

| Context | Level | What changes |
|---|---|---|
| 0-15% | Empty office | One cabinet per side, a clear night, Claude strolling |
| 15-35% | Getting busy | Clouds, a second cabinet |
| 35-55% | Busy | Drizzle, stacks on both sides, the first flying papers |
| 55-75% | Stressed | Rain, drawers popping open, worried brows |
| 75-90% | Panicking | A downpour, sweat, speed lines, crowded sides |
| 90-100% | Chaos | A storm, the fullest stacks, arms up, lamps swinging wide |

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install office-worker-claude --marketplace Yuds16/office-worker-claude
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install office-worker-claude --marketplace Yuds16/office-worker-claude
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box,
then Plugins, Add marketplace with `Yuds16/office-worker-claude`, then Add plugin.

The backdrop shows in the desktop app after the first message of a session. It
needs Claude Code 2.1.324 or later (check with `/status`). A session has one
backdrop, so turn off any other theme mod while this one is on.

## The /office command

- `/office` shows the level, the fit and how many helpers are working.
- `/office 1` to `/office 6` previews a level; `/office auto` follows the real context again.
- `/office fit <left%> <right%>` fits the room into the part of the window that
  side panels leave uncovered, for example `/office fit 0 35` with a pane open on
  the right. `/office fit` alone goes back to the whole window. The app does not
  tell mods which panels are open, so this is set by hand.

## Good to know

- Shell tools (Bash, PowerShell) have no pose on purpose: hooking a tool call
  turns off its move to the background and its live output.
- To keep motion gentle, the backdrop changes at most once every five seconds,
  always showing the latest state. With reduced motion turned on, the app shows
  the scene still.
- If the scene is hidden behind the glass, check that Transparency effects is on
  (Windows) or Reduce transparency is off (macOS).

## Customizing

Placement constants (room shape, cabinet stacks, Claude's lane, helper lanes,
desks, lamps, windows) are at the top of `hooks/scene.ts`, with a comment on
each. The level thresholds are in `hooks/levels.ts`, and which tools pick which
pose is `TOOL_ACTIONS` in `hooks/register.tsx`.

## License

MIT
