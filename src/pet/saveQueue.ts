export type LatestSaveQueue<T> = (value: T) => Promise<void>;

// Keep one write in flight and retain only the newest pending snapshot. This
// avoids racing desktop writes that share the same temporary state file while
// still guaranteeing that the latest state observed during a write is saved.
export function createLatestSaveQueue<T>(write: (value: T) => Promise<void>): LatestSaveQueue<T> {
  let pending: T;
  let hasPending = false;
  let draining: Promise<void> | null = null;

  const drain = async () => {
    let firstError: unknown;
    try {
      while (hasPending) {
        const value = pending;
        hasPending = false;
        try {
          await write(value);
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError !== undefined) throw firstError;
    } finally {
      draining = null;
    }
  };

  return (value: T) => {
    pending = value;
    hasPending = true;
    if (!draining) {
      draining = drain();
    }
    return draining;
  };
}
