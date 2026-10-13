// Browser-only API (task P2). Runs the same rules code as the Node server (server/api.js)
// against a store kept in this visitor's localStorage, so every visitor gets their own demo data.
import { handle } from './server/api.js';
import { seed } from './server/domain.js';

// Bump the version when the seed changes, so returning visitors get the new demo data.
const STORAGE_KEY = 'returns-refunds-demo:v2';
let storePromise = null;
let persistent = true;

function readSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    persistent = false;
    return null;
  }
}

function createStore(initial) {
  const claims = new Map((initial || []).map(c => [c.id, c]));
  const persist = () => {
    if (!persistent) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...claims.values()]));
    } catch {
      // Storage full or blocked (large uploads, private mode): keep working for this tab only.
      persistent = false;
    }
  };
  return {
    all: () => [...claims.values()].sort((a, b) => a.id.localeCompare(b.id)).map(c => structuredClone(c)),
    get: id => (claims.has(id) ? structuredClone(claims.get(id)) : undefined),
    save: c => { claims.set(c.id, structuredClone(c)); persist(); },
  };
}

async function openStore() {
  const store = createStore(readSaved());
  if (!store.all().length) {
    const response = await fetch('contract/seed.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the demo data.');
    seed(store, await response.json(), Date.now());
  }
  return store;
}

export async function request(path, body) {
  storePromise ??= openStore();
  const store = await storePromise;
  return handle({
    store,
    method: body ? 'POST' : 'GET',
    path: '/' + path,
    body: body ? JSON.parse(JSON.stringify(body)) : undefined,
    now: Date.now(),
  });
}

export function savedLocally() {
  return persistent;
}

export function reset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing saved */ }
  storePromise = null;
}
