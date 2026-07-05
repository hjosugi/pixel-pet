# pixel-pet

`pixel-pet` is a lightweight desktop pet prototype.

Concept:

```txt
OS native resident app
+ cute pixel art
+ cyberpunk glow
+ calm idle animation
+ small dialogue
+ future AI chat, mini-games, and pet exchange
```

This starter uses:

```txt
Tauri v2
TypeScript
Vite
Canvas 2D
Rust tray menu
Original free pixel spritesheet
```

## Run

Prerequisites:

```txt
Node.js
Rust
Tauri v2 prerequisites for your OS
```

Install and run:

```bash
npm install
npm run tauri:dev
```

Build:

```bash
npm run tauri:build
```

Release build notes for Windows, macOS, and Linux are in
`docs/RELEASE_BUILDS.md`.

## What works now

```txt
- transparent small desktop window
- always-on-top pet window
- taskbar hidden on Windows/Linux
- tray menu: show / hide / quit
- procedural cyber cat pixel drawing
- free cyber cat spritesheet asset with procedural fallback
- extra original free pet packs: cyber-penguin and kofun-friend
- in-window pet picker with persistent selection
- persisted low-distraction mode
- local focus timer with configurable rest nudges
- offline rule-based dialogue per pet pack
- optional on-demand chat adapters: rule, Ollama, OpenAI
- optional ball toss mini-game
- persistent XP, level, affection, and reward items
- local pet capsule JSON export/import
- idle / walk / sleep / react state machine
- click reaction
- short dialogue bubble
- desktop app-data state persistence with browser-preview fallback
```

## Important notes

- macOS transparent windows require `macOSPrivateApi: true` in this prototype.
- That is fine for a local prototype, but not for App Store distribution.
- The current pet is procedural Canvas art. Replace it with a sprite sheet when the first real pet art is ready.
- The repository uses the 0BSD License so code and generated placeholder assets are broadly reusable.
- Kofun Friends art is approved for the `kofun-friend` pet pack once the actual source files are added with a short source note.
- See `docs/ASSETS.md` for the asset policy.
- LLM is intentionally not always running. Keep AI on-demand only.
- Generated desktop bundles live under `src-tauri/target` and are ignored by
  git; the release workflow uploads them as artifacts.

## Performance budget

- Idle and walk animation targets 10 FPS.
- React animation targets 12 FPS.
- Sleep animation targets 4 FPS.
- Hidden documents skip canvas drawing and run only a 5 second maintenance tick for state updates and saves.
- Low-distraction mode cuts idle movement, suppresses glitch overlays, and raises self-initiated talk spacing to 15 minutes.
- The focus timer supports 15, 25, and 45 minute rest reminder intervals, rewards completed intervals with small mood/affection gains, and rate-limits reminders.
- The ball game raises the animation target to 20 FPS only while active, then returns to the normal low-FPS pet scheduler.
- Focus mode and low-distraction mode reduce energy drain and stop mood drain while the user is busy.
- Add `?debugTiming=1` in a browser preview, or run on localhost, to show the dev timing readout.

## Desktop shell notes

- The Tauri window is frameless, transparent, fixed-size, always on top, and hidden from the taskbar where the platform supports `skipTaskbar`.
- Drag from the top strip of the pet window to reposition it.
- The tray menu provides Show Pixel Pet, Hide, and Quit.
- Closing the window hides it to the tray; use Quit from the tray menu to exit the app.
- macOS transparency uses `macOSPrivateApi`, which is acceptable for this local prototype but not for App Store distribution.
- Windows and Linux taskbar hiding depends on the desktop shell; the tray menu remains the fallback control surface.

## State storage

Desktop builds store pet state in the Tauri app data directory as
`pet-state.v1.json`. The file contains a `schemaVersion` field and a `state`
object. Bad JSON or unknown schema versions are ignored and the app falls back
to defaults.

Typical local debug paths:

- macOS: `~/Library/Application Support/dev.local.pixel-pet/pet-state.v1.json`
- Windows: `%APPDATA%\dev.local.pixel-pet\pet-state.v1.json`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/dev.local.pixel-pet/pet-state.v1.json`

Existing browser-preview `localStorage` state is migrated into the desktop state
file on first successful load. Plain browser previews still use `localStorage`
as a fallback because Tauri commands are unavailable there.

The active pet id is stored with the same state file. Each pet keeps its own
mood, energy, and affection memory, while the window position and resident app
settings stay shared across pet switches.

Low-distraction mode is also stored in the state file. The in-window `quiet`
button toggles it, and host integrations can dispatch a browser custom event to
mirror an external focus-mode switch:

```js
window.dispatchEvent(new CustomEvent("pixel-pet:focus-mode", { detail: { enabled: true } }));
```

The focus timer state is stored in the same file. The `focus` button starts or
pauses the current session, the interval selector controls the rest reminder
cadence, and completed intervals increase mood and affection without sending
repeated reminders.

Progression is stored under a versioned `progression.schemaVersion` object
inside the pet state. XP, level, reward items, and reward cooldown history are
normalized on load so old state files safely start at level 1. Each selected pet
keeps separate mood, affection, XP, level, and reward inventory.

Dialogue runs fully offline. Each pet pack provides short lines for click,
idle, sleep, focus, late-night, and low-energy triggers in
`manifest.json > personality.dialogue`; the runtime applies per-trigger
cooldowns and enforces the 44 character bubble limit.

## Optional AI chat

The pet never calls an LLM during idle animation, movement, focus nudges, or
ambient dialogue. Networked adapters run only after a user submits text in the
chat box.

Providers:

- `rule`: offline rule-based fallback, no network.
- `ollama`: sends the prompt and short in-memory history to
  `http://localhost:11434/api/chat` with model `llama3.2`.
- `openai`: sends the prompt and short in-memory history to the OpenAI
  Responses API using model `gpt-5.5`.

The OpenAI key is requested with a browser prompt and kept in memory only; it is
not written to the app state file. OpenAI usage may cost money on the account
that owns the API key. Adapter timeouts, missing keys, unavailable Ollama, and
API failures fall back to rule-based dialogue without breaking pet behavior.

## Ball game

The `ball` button starts a short toss game in the transparent pet window. Click
inside the canvas while the game is active to toss the ball; the pet will chase
and react when it catches up. Press `stop`, let the ball settle, or wait 45
seconds to return to normal idle behavior.

Rewards are intentionally small and optional: explicit interaction gives tiny
XP on a cooldown, focus intervals grant `focus-star` items, and ball catches can
grant `play-spark` items. There is no XP decay or punishment for leaving the pet
alone.

## Pet capsules

The `export` button downloads the selected pet as a local JSON capsule. The
schema includes:

```txt
schema
schemaVersion
compatibility.minAppVersion
compatibility.features
exportedAt
pet.id / pet.packId / pet.name / pet.seed
pet.traits
pet.ownerNote
pet.progression
```

The `import` button reads a local JSON capsule and validates the schema version,
pack id, traits, and progression before changing state. Unknown packs, malformed
JSON, unsupported schema versions, and invalid progression payloads fail safely
with no state change. QR sharing is intentionally left as a follow-up layer on
top of this JSON schema.

Signature fields are reserved in exported capsules. Imports currently label
valid capsules as unsigned or unverified signed; neither is treated as trusted.
See `docs/CAPSULE_SHARING.md` for the QR payload and signature plan.

## Pet packs

Pet packs live under `assets/pets/<pack>/` and are loaded from metadata at build
time. A pack must include:

```txt
manifest.json
spritesheet.json
spritesheet.png
```

`manifest.json` defines the pet id, display name, asset file names, base frame
size, render scale, and expected animation FPS/loop settings. `spritesheet.json`
defines frame size, layout rows/columns, animation rows, frame lists, FPS, and
loop behavior. Invalid or missing pack metadata is ignored and the renderer
falls back to the default pack or the procedural pet renderer.

## Next steps

```txt
v0.2
- replace procedural pet with spritesheet animation
- add settings window
- add low distraction mode
- add pet pack import/export

v0.3
- add ball mini-game
- add pet XP and affection
- add focus timer integration

v0.4
- add local LLM adapter
- add optional cloud LLM adapter
- add short memory summary

v0.5
- add pet capsule export/import
- add QR exchange
```

## License

0BSD. You can use, copy, modify, and distribute this project for almost any purpose.
