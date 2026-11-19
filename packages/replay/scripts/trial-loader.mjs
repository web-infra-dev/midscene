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

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL;
  if (!parent?.startsWith('file:') || !parent.includes(trialKey))
    return nextResolve(specifier, context);
  const owner = new URL(parent).searchParams.get(trialKey);
  if (!owner) return nextResolve(specifier, context);

  const [id, role] = owner.split('/');
  const trial = trials.get(id);
  if (!trial) return nextResolve(specifier, context);

  // Installed dependencies are host inputs. Package import aliases resolving
  // to local files follow the same rules as relative ESM imports.
  const local =
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('#') ||
    isAbsolute(specifier);
  const resolved = await nextResolve(specifier, context);
  if (!local || !resolved.url.startsWith('file:')) return resolved;
  const target = new URL(resolved.url);
  const file = realpathSync(fileURLToPath(target));
  const path = relative(trial.roots[role], file);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new Error(
      `TRIAL_IMPORT_OUTSIDE_ROOT: ${role} import ${specifier} from ${fileURLToPath(parent)} resolves outside ${trial.roots[role]}`,
    );
  if (
    path.split(sep).some((part) => part === 'node_modules' || part === '.git')
  )
    throw new Error(
      `TRIAL_IMPORT_EXCLUDED: ${role} import ${specifier} resolves to an excluded directory`,
    );
  await trial.snapshot(role, file);
  target.searchParams.set(trialKey, owner);
  return { ...resolved, url: target.href };
}
