# Contributing

Thanks for your interest in pixel-pet. It is a small, local-first desktop pet;
contributions that keep it light and calm are very welcome.

## Development setup

Prerequisites: Node.js, Rust, and the Tauri v2 prerequisites for your OS. On
Linux you also need an AppIndicator library (see `README.md`).

```bash
npm install
npm run tauri:dev     # desktop app
npm run dev           # browser preview only (no native features)
```

## Before opening a pull request

Run the full local check:

```bash
npm run check         # tsc + vite build + unit tests + cargo check
```

Individually:

```bash
npm run build         # typecheck + bundle
npm run test          # vitest unit tests
npm run assets:check  # regenerate + validate bundled pet packs
```

Please add or update tests under `tests/` for logic changes, and keep the
existing style (small modules, defensive normalization of any untrusted input,
no new heavy dependencies).

## Guiding principles

- The resident app stays light. Animation and basic behavior are a local state
  machine; never put an LLM on the animation loop.
- Networking and AI are on-demand and optional; everything works offline.
- Untrusted input (imported capsules, external packs, activity events) is always
  validated and safely ignored on any mismatch.

## Pet packs

Pet art lives in `assets/pets/<pack>/` as `manifest.json`, `spritesheet.json`,
and `spritesheet.png`. Validate a pack folder before sharing it:

```bash
npm run assets:validate -- path/to/pack
```

See the "Pet packs" and "Community pet packs" sections in `README.md` for the
format and how external packs load at runtime.

## License

By contributing you agree that your contributions are licensed under the 0BSD
license, the same as the rest of the project.
