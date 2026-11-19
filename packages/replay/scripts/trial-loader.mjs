import { realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const trials = new Map();
let trialKey;

export function initialize({ control, trialKey: key }) {
  trialKey = key;
  control.on('message', ({ id, roots, port }) => {
    const pending = new Map();
    let ticket = 0;
    trials.set(id, {
      roots,
      snapshot(role, file) {
        return new Promise((done, fail) => {
          const current = ++ticket;
          pending.set(current, { done, fail });
          port.postMessage({ role, file, ticket: current });
        });
      },
    });
    port.on('message', ({ ticket, error }) => {
      const { done, fail } = pending.get(ticket);
      pending.delete(ticket);
      if (error) fail(new Error(error));
      else done();
    });
    port.on('close', () => {
      trials.delete(id);
      for (const { fail } of pending.values())
        fail(new Error('Replay trial finished during module resolution'));
    });
    port.postMessage('ready');
  });
}

export function trackLocalResolution(
  specifier,
  parent,
  resolved,
  key,
  activeTrials,
) {
  if (!parent?.startsWith('file:') || !parent.includes(key)) return;
  const owner = new URL(parent).searchParams.get(key);
  if (!owner) return;

  const [id, role] = owner.split('/');
  const trial = activeTrials.get(id);
  if (!trial) return;

  // Installed dependencies are host inputs. Package import aliases resolving
  // to local files follow the same rules as relative ESM imports.
  const local =
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('#') ||
    isAbsolute(specifier);
  if (!local || !resolved.url.startsWith('file:')) return;
  const target = new URL(resolved.url);
  const file = realpathSync(fileURLToPath(target));
  const path = relative(trial.roots[role], file);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new Error(
      `TRIAL_IMPORT_OUTSIDE_ROOT: ${role} import ${specifier} from ${fileURLToPath(parent)} resolves outside ${trial.roots[role]}`,
    );
  if (
    path.split(sep).some((part) => part === 'node_modules' || part === '.git')
  ) {
    throw new Error(
      `TRIAL_IMPORT_EXCLUDED: ${role} import ${specifier} resolves to an excluded directory`,
    );
  }
  target.searchParams.set(key, owner);
  return { trial, role, file, resolution: { ...resolved, url: target.href } };
}

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context);
  const tracked = trackLocalResolution(
    specifier,
    context.parentURL,
    resolved,
    trialKey,
    trials,
  );
  if (!tracked) return resolved;
  await tracked.trial.snapshot(tracked.role, tracked.file);
  return tracked.resolution;
}
