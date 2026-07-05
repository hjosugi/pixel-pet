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

## What works now

```txt
- transparent small desktop window
- always-on-top pet window
- taskbar hidden on Windows/Linux
- tray menu: show / hide / quit
- procedural cyber cat pixel drawing
- free cyber cat spritesheet asset with procedural fallback
- extra original free pet packs: cyber-penguin and kofun-friend
- idle / walk / sleep / react state machine
- click reaction
- short dialogue bubble
- localStorage state persistence
```

## Important notes

- macOS transparent windows require `macOSPrivateApi: true` in this prototype.
- That is fine for a local prototype, but not for App Store distribution.
- The current pet is procedural Canvas art. Replace it with a sprite sheet when the first real pet art is ready.
- The repository uses the 0BSD License so code and generated placeholder assets are broadly reusable.
- Kofun Friends art is approved for the `kofun-friend` pet pack once the actual source files are added with a short source note.
- See `docs/ASSETS.md` for the asset policy.
- LLM is intentionally not always running. Keep AI on-demand only.

## Performance budget

- Idle and walk animation targets 10 FPS.
- React animation targets 12 FPS.
- Sleep animation targets 4 FPS.
- Hidden documents skip canvas drawing and run only a 5 second maintenance tick for state updates and saves.
- Add `?debugTiming=1` in a browser preview, or run on localhost, to show the dev timing readout.

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
