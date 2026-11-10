import { createDb, type MockDb } from "./seed";

// In-memory store. It is rebuilt from the fixed seed on every page load, so a browser refresh
// returns the demo to its starting state.

let current: MockDb | null = null;

export function db(): MockDb {
  if (!current) current = createDb();
  return current;
}

export function resetDb(): MockDb {
  current = createDb();
  return current;
}
