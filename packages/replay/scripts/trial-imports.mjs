import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { MessageChannel } from 'node:worker_threads';

const trialKey = 'midscene-replay-trial';
let loader;

export async function trackTrialImports(roots, snapshot) {
  if (!loader) {
    const { port1, port2 } = new MessageChannel();
    register(new URL('./trial-loader.mjs', import.meta.url), {
      data: { control: port2, trialKey },
      transferList: [port2],
    });
    port1.unref();
    loader = port1;
  }

  const id = randomUUID();
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

  return {
    importEntry(file, role) {
      // Isolate each group's module cache and carry its boundary to lazy imports.
      const entry = pathToFileURL(file);
      entry.searchParams.set(trialKey, `${id}/${role}`);
      return import(entry.href);
    },
    close() {
      port1.close();
    },
  };
}
