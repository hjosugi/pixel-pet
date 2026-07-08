#!/usr/bin/env node
// Claude Code activity hook for pixel-pet.
//
// Register this on Claude Code hook events (see docs/ACTIVITY_HOOKS.md). On each
// event it appends one normalized activity object to the pixel-pet desktop
// inbox file; the running app drains and reacts to it. It NEVER fails the hook:
// any error is swallowed and the process exits 0.
//
// It picks the activity kind from the Claude Code `hook_event_name` on stdin,
// or from an explicit `--kind <kind>` argument.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_IDENTIFIER = "dev.local.pixel-pet";
const INBOX_FILE = "activity-inbox.jsonl";
const VALID_KINDS = new Set(["start", "working", "waiting", "done", "error"]);

// Map Claude Code hook events onto pixel-pet activity kinds.
const EVENT_KIND = {
  SessionStart: "start",
  UserPromptSubmit: "working",
  PreToolUse: "working",
  Notification: "waiting",
  Stop: "done",
  SubagentStop: "done",
};

function appDataDir() {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_IDENTIFIER);
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), APP_IDENTIFIER);
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), APP_IDENTIFIER);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

try {
  const payload = readPayload();
  const explicitKind = argValue("--kind");
  const kind = explicitKind ?? EVENT_KIND[payload.hook_event_name];

  if (kind && VALID_KINDS.has(kind)) {
    const label = argValue("--label") ?? payload.tool_name ?? payload.hook_event_name ?? null;
    const dir = appDataDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, INBOX_FILE), `${JSON.stringify({ kind, source: "claude-code", label })}\n`);
  }
} catch {
  // Never break the host on a pet notification.
}

process.exit(0);
