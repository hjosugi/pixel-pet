import { invoke } from "@tauri-apps/api/core";
import { normalizeActivityEvent, type ActivityEvent } from "./activity";

// Desktop transport for the activity layer. The Tauri backend exposes a local
// file inbox (`activity-inbox.jsonl` in the app data dir) that external
// processes append to; this drains and normalizes it. Safe no-op in a plain
// browser preview where the command is unavailable.
export async function drainActivityInbox(): Promise<ActivityEvent[]> {
  let raw: unknown;
  try {
    raw = await invoke<unknown>("drain_activity_inbox");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const events: ActivityEvent[] = [];
  for (const entry of raw) {
    const activity = normalizeActivityEvent(entry);
    if (activity) events.push(activity);
  }
  return events;
}
