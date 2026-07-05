# Architecture

## Core principle

Keep the resident app light.

```txt
Animation: local state machine
Dialogue: rule-based first
LLM: on-demand only
Storage: local first
Network: optional only
```

## Runtime split

```txt
Rust / Tauri
- native window
- tray menu
- show / hide / quit
- future auto-start
- future local file storage

TypeScript / Canvas
- pet animation
- state machine
- dialogue bubble
- interactions
- on-demand chat adapter dispatch
- future mini-games
```

## Pet state machine

```txt
idle
  -> walk   random low-frequency movement
  -> sleep  low energy
  -> react  click

walk
  -> idle   after a few seconds
  -> react  click

sleep
  -> idle   when energy recovers
  -> react  click
```

## AI plan

Do not use LLM for animation or basic pet behavior.

Use AI only for:

```txt
- short conversation
- personality variation
- daily summary
- optional encouragement
```

Adapters:

```txt
RuleBasedAiAdapter
OllamaAiAdapter
OpenAiAdapter
```

The adapter path is explicit-user-action only: idle animation, movement,
ambient dialogue, and focus nudges never call an LLM. The browser keeps a short
in-memory message history and falls back to rule-based dialogue on timeout,
missing credentials, local Ollama failures, or cloud API failures.
