# Roadmap

## v0.1 Prototype

```txt
- desktop window
- transparent always-on-top pet
- tray menu
- state machine
- procedural pixel cat
- short dialogue
```

## v0.2 Art pipeline

```txt
- Aseprite sprite sheet import
- pet manifest loader
- animation frame system
- multiple skins
- selectable pet packs: cyber-cat, cyber-penguin, kofun-friend
```

## v0.3 Healing experience

```txt
- focus timer
- rest reminders
- low distraction mode
- ambient cyberpunk effects
```

## v0.4 Mini-games

```txt
- ball throw
- 30-second reflex game
- reward items
- affection and XP
```

## v0.5 AI conversation

```txt
- local rule-based fallback
- optional Ollama adapter
- optional cloud LLM adapter
- short memory summary
```

## v0.6 Pet exchange

```txt
- pet capsule JSON
- import / export
- QR exchange
- seed-based visual traits
```

## v0.7 Work companion

```txt
- activity layer: pet reacts to real work (start/working/waiting/done/error)
- agent-agnostic ActivitySource abstraction
- desktop activity inbox + Claude Code hook
- runtime community pet packs from the app data packs/ directory
- unit tests (vitest) and CI test gate
- browser web demo (npx / GitHub Pages) and contributor/security docs
```

Done in v0.7 so far: activity layer, ActivitySource, desktop inbox + Claude Code
hook, community packs, vitest suite + CI, web demo tooling, CONTRIBUTING/SECURITY.

Next: wire more sources (git, editors), pack-level activity lines, optional
signed capsules.
