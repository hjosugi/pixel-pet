<!-- i18n: language-switcher -->
[English](ACTIVITY_HOOKS.md) | [日本語](ACTIVITY_HOOKS.ja.md)

# Activity hooks

The pet can react to real work through the activity layer. A host process reports
what is happening and the pet plays a short reaction (see the "Activity events"
section in `README.md`). There are two transports:

1. In-webview: dispatch a `pixel-pet:activity` `CustomEvent` (browser preview or
   an embedding host).
2. Desktop file inbox: append activity objects to a local file that the running
   app drains on a low-frequency poll. This is how an external tool such as
   Claude Code feeds the pet.

## Desktop inbox

The desktop app reads and clears `activity-inbox.jsonl` in its app data
directory:

- macOS: `~/Library/Application Support/dev.local.pixel-pet/activity-inbox.jsonl`
- Windows: `%APPDATA%\dev.local.pixel-pet\activity-inbox.jsonl`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/dev.local.pixel-pet/activity-inbox.jsonl`

Each line is one JSON object:

```json
{ "kind": "done", "source": "claude-code", "label": "build" }
```

`kind` is one of `start`, `working`, `waiting`, `done`, `error`. Draining is
best-effort and local-only: the file is removed after reading, malformed lines
are skipped, and only the most recent events are applied.

## Claude Code hook

`tools/claude-code-activity-hook.mjs` appends an event to the inbox. It reads the
Claude Code `hook_event_name` from stdin and maps it to a kind, or takes an
explicit `--kind <kind>`. It never fails the host — any error exits 0.

Event mapping:

| Claude Code event | activity kind |
| ----------------- | ------------- |
| `SessionStart`    | `start`       |
| `UserPromptSubmit`| `working`     |
| `PreToolUse`      | `working`     |
| `Notification`    | `waiting`     |
| `Stop`            | `done`        |
| `SubagentStop`    | `done`        |

Register it in your Claude Code settings (use an absolute path to the script):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "PreToolUse":   [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node /ABS/PATH/pixel-pet/tools/claude-code-activity-hook.mjs" }] }]
  }
}
```

You can also drive the pet manually to test the wiring:

```bash
node tools/claude-code-activity-hook.mjs --kind done --label "manual test"
```

## Adding another source

Sources are agent-agnostic. To add one (git, an editor, a different agent),
either append to the inbox file with `{ kind, source, label }` lines, or add an
`ActivitySource` in `src/pet/activitySource.ts` and register it in `main.ts`.
The pet only ever sees normalized `ActivityEvent`s, so new sources need no
changes to the pet itself.
