import { fork } from 'node:child_process';
import { allowedUrl } from './config.mjs';

// The browser/model process does not inherit the GitHub App key, report token,
// webhook secret, or arbitrary shell environment. Never execute PR source code.
export function runnerEnvironment(env) {
  const allowed = [
    'PATH',
    'HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
    'SYSTEMROOT',
    'PUPPETEER_EXECUTABLE_PATH',
    'PUPPETEER_CACHE_DIR',
  ];
  const result = Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        allowed.includes(key) ||
        key.startsWith('MIDSCENE_MODEL_') ||
        /^MIDSCENE_(PLANNING|INSIGHT|GROUNDING)_MODEL_/.test(key),
    ),
  );
  const networkOptions = (env.NODE_OPTIONS ?? '').match(
    /(?:^|\s)--network-family-autoselection-attempt-timeout=\d+(?=\s|$)/g,
  );
  if (networkOptions?.length)
    result.NODE_OPTIONS = networkOptions.map((value) => value.trim()).join(' ');
  return result;
}

export function runBrowser(input) {
  allowedUrl(input.previewUrl, input.policy);
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./browser-worker.mjs', import.meta.url), [], {
      env: {
        ...runnerEnvironment(process.env),
        MIDSCENE_RUN_DIR: `${input.directory}/runtime`,
      },
      cwd: input.directory,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      // Do not forward parent --test/--inspect flags.
      execArgv: [],
    });
    let result;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.send({ type: 'cancel' });
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, input.policy.timeoutMs);
    let killTimer;
    child.on('message', (message) => {
      if (message.type === 'result') result = message.result;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(error);
    });
    child.on('exit', () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve(
        timedOut
          ? { status: 'timed-out', criteria: [] }
          : (result ?? { status: 'error', criteria: [] }),
      );
    });
    child.send({ type: 'run', input });
  });
}
