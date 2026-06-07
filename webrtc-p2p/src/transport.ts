/**
 * Transport abstraction: a 2-way message channel between two peers. The host/guest session
 * logic depends only on this interface, so it can be unit-tested with an in-memory pair
 * (no real WebRTC) and run for real over a WebRTC DataChannel in the browser.
 */
export interface Transport {
  send(data: unknown): void;
  onMessage(cb: (data: unknown) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

/** An in-process pair of transports wired to each other — used by tests. */
export function createMemoryPair(): { a: Transport; b: Transport } {
  let aMsg: ((d: unknown) => void) | null = null;
  let bMsg: ((d: unknown) => void) | null = null;
  let aClose: (() => void) | null = null;
  let bClose: (() => void) | null = null;
  let open = true;

  const a: Transport = {
    send: (d) => {
      if (open) queueMicrotask(() => bMsg?.(clone(d)));
    },
    onMessage: (cb) => {
      aMsg = cb;
    },
    onClose: (cb) => {
      aClose = cb;
    },
    close: () => {
      if (!open) return;
      open = false;
      aClose?.();
      bClose?.();
    },
  };
  const b: Transport = {
    send: (d) => {
      if (open) queueMicrotask(() => aMsg?.(clone(d)));
    },
    onMessage: (cb) => {
      bMsg = cb;
    },
    onClose: (cb) => {
      bClose = cb;
    },
    close: () => {
      if (!open) return;
      open = false;
      aClose?.();
      bClose?.();
    },
  };
  return { a, b };
}

/** Messages cross a real channel as JSON, so emulate that boundary in the memory pair. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
