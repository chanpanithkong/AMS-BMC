import { isApiError } from "./errors";

// Idempotency-Key handling (SRS §13.1, RK-03).
// One key per user action. The SAME key is sent again when the request is retried after a network
// failure, so the server can replay its stored response instead of posting twice. A new key is
// created only for a new user action.

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC 4122 v4 fallback for old environments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Holds the key for the action in flight. */
export class IdempotencyKeyHolder {
  private key: string | null = null;

  /** Key for the current action: reused until `settle()` is called. */
  current(): string {
    if (!this.key) this.key = newIdempotencyKey();
    return this.key;
  }

  /** The server answered (success or a business error): the next click is a new action. */
  settle(): void {
    this.key = null;
  }

  get pending(): boolean {
    return this.key !== null;
  }
}

/**
 * Run an idempotent action. If it fails because the network dropped, the key is kept so that the
 * user's retry sends the same key; any answer from the server releases the key.
 */
export async function runIdempotent<T>(holder: IdempotencyKeyHolder, action: (key: string) => Promise<T>): Promise<T> {
  const key = holder.current();
  try {
    const result = await action(key);
    holder.settle();
    return result;
  } catch (error) {
    const keepKey = isApiError(error) && (error.isNetworkError || error.status >= 500);
    if (!keepKey) holder.settle();
    throw error;
  }
}
