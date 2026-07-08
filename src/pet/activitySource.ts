import { normalizeActivityEvent, type ActivityEvent } from "./activity";
import { drainActivityInbox } from "./activityInbox";

// An ActivitySource is any way the outside world can tell the pet what is
// happening. It is deliberately agent-agnostic: today we ship a browser custom
// event and a desktop file inbox, but a git watcher, an editor extension, or a
// non-Claude agent all fit the same shape. This mirrors pixel-agents'
// HookProvider — the pet only ever sees normalized ActivityEvents.
export type ActivityHandler = (event: ActivityEvent) => void;

export type ActivitySource = {
  name: string;
  // Begin delivering events to `onEvent`; returns a stop function.
  start(onEvent: ActivityHandler): () => void;
};

// Source 1: an in-page `pixel-pet:activity` CustomEvent. Works in the browser
// preview and lets a host embedding the webview drive the pet directly.
export function customEventActivitySource(): ActivitySource {
  return {
    name: "custom-event",
    start(onEvent) {
      const handler = (event: Event) => {
        const activity = normalizeActivityEvent((event as CustomEvent<unknown>).detail);
        if (activity) onEvent(activity);
      };
      window.addEventListener("pixel-pet:activity", handler);
      return () => window.removeEventListener("pixel-pet:activity", handler);
    },
  };
}

// Source 2: poll the desktop file inbox on a low-frequency timer. Desktop only;
// harmless but pointless in a browser preview, so callers gate it on Tauri.
export function inboxActivitySource(intervalMs = 2_000): ActivitySource {
  return {
    name: "desktop-inbox",
    start(onEvent) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const poll = async () => {
        if (stopped) return;
        try {
          const events = await drainActivityInbox();
          if (stopped) return;
          for (const event of events) onEvent(event);
        } finally {
          if (!stopped) timer = setTimeout(poll, intervalMs);
        }
      };

      timer = setTimeout(poll, intervalMs);
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    },
  };
}
