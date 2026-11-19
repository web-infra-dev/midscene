import { randomUUID } from 'node:crypto';
import * as nodeModule from 'node:module';
import { pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';
import { trackLocalResolution } from './trial-loader.mjs';

const trialKey = 'midscene-replay-trial';
const activeTrials = new Map();
let hooks;
let loader;

function trackInProcess(id, roots, snapshot) {
  // Synchronous hooks keep snapshot I/O on the importing thread. Newer Node
  // versions can block that thread waiting for a worker-based resolve hook.
  hooks ??= nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (context.conditions.includes('require')) return resolved;
      const tracked = trackLocalResolution(
        specifier,
        context.parentURL,
        resolved,
        trialKey,
        activeTrials,
      );
      if (!tracked) return resolved;
      tracked.trial.snapshot(tracked.role, tracked.file);
      return tracked.resolution;
    },
  });
  activeTrials.set(id, { roots, snapshot });
  return () => {
    if (activeTrials.delete(id) && !activeTrials.size) {
      hooks.deregister();
      hooks = undefined;
    }
  };
}

async function trackInWorker(id, roots, snapshot) {
  if (!loader) {
    const { port1, port2 } = new MessageChannel();
    nodeModule.register(new URL('./trial-loader.mjs', import.meta.url), {
      data: { control: port2, trialKey },
      transferList: [port2],
    });
    port1.unref();
    loader = port1;
  }
  const { port1, port2 } = new MessageChannel();
  const ready = new Promise((resolve) => port1.once('message', resolve));
  loader.postMessage({ id, roots, port: port2 }, [port2]);
  await ready;
  port1.on('message', ({ role, file, ticket }) => {
    try {
      snapshot(role, file);
      port1.postMessage({ ticket });
    } catch (error) {
      port1.postMessage({ ticket, error: String(error) });
    }
  });
  return () => port1.close();
}

export async function trackTrialImports(roots, snapshot) {
  const id = randomUUID();
  const close = nodeModule.registerHooks
    ? trackInProcess(id, roots, snapshot)
    : await trackInWorker(id, roots, snapshot);

  return {
    importEntry(file, role) {
      // Isolate each group's module cache and carry its boundary to lazy imports.
      const entry = pathToFileURL(file);
      entry.searchParams.set(trialKey, `${id}/${role}`);
      return import(entry.href);
    },
    close,
  };
}
