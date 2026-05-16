import vm from 'vm';
import { vmExecutionDuration } from './metrics';

const ASYNC_TIMEOUT_MS = 5000;

// Persistent key-value store across all requests
const persistentKVStore = new Map<string, any>();

function createSandbox(req: any) {
  const context = vm.createContext({
    ...globalThis,          // spreads all node globals automatically
    require,                // not on globalThis in ESM contexts, add explicitly
    queueMicrotask,         // same

    // override/add route-specific globals
    request: {
      method: req.method,
      path: req.path,
      headers: req.headers,
      query: req.query,
      body: req.body,
    },
    response: {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: '{"status": "ok"}',
    },
    kv: {
      get: (key: string) => persistentKVStore.get(key),
      set: (key: string, value: any) => persistentKVStore.set(key, value),
      clear: (key: string) => persistentKVStore.delete(key),
      list: () => Object.fromEntries(persistentKVStore),
      eraseAllKeys: () => persistentKVStore.clear(),
    },
  });

  return context;
}

export async function executeDynamicRoute(scriptContent: string, req: any) {
  const end = vmExecutionDuration.startTimer();

  // Wrap user script so top-level await works and the Promise is returned
  const wrapped = `(async () => { ${scriptContent} })()`;

  let worker: ReturnType<typeof setTimeout> | null = null;

  try {
    const context = createSandbox(req);
    const script = new vm.Script(wrapped, {
      filename: 'dynamic-route.js', // improves stack traces
    });

    // runInContext returns the async IIFE's Promise
    const promise = script.runInContext(context, {
      timeout: 1000, // only covers synchronous startup — guards against infinite sync loops
    }) as Promise<void>;

    // Race the async body against a wall-clock timeout
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        worker = setTimeout(
          () => reject(new Error(`Script exceeded ${ASYNC_TIMEOUT_MS}ms async timeout`)),
          ASYNC_TIMEOUT_MS
        );
      }),
    ]);

    end();
    return context.response;
  } catch (err: any) {
    end();
    return {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: `Execution Error: ${err.message}`,
    };
  } finally {
    if (worker) clearTimeout(worker);
  }
}
