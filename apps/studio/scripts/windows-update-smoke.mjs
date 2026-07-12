import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const studioRootDir = path.resolve(path.dirname(__filename), '..');
const workspaceRootDir = path.resolve(studioRootDir, '..', '..');
const defaultArtifactDir = path.join(
  workspaceRootDir,
  '.release',
  'studio',
  'artifacts',
);
const defaultDiagnosticsDir = path.join(
  workspaceRootDir,
  '.release',
  'studio',
  'windows-update-smoke',
);
const executableName = 'Midscene Studio Beta.exe';
const processName = 'Midscene Studio Beta';

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalizeVersion = (version) => version.trim().replace(/^v/, '');

const powershellQuote = (value) => `'${value.replaceAll("'", "''")}'`;

async function waitFor(condition, { timeoutMs, intervalMs = 500, label }) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`,
  );
}

function runCommand(
  command,
  args,
  { allowFailure = false, env = process.env, timeoutMs = 120_000 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      callback();
    };

    const timeoutId = setTimeout(() => {
      child.kill();
      settle(() =>
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms running ${command} ${args.join(' ')}`,
          ),
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => settle(() => reject(error)));
    child.on('exit', (code, signal) => {
      settle(() => {
        const result = { code, signal, stderr, stdout };
        if (allowFailure || (code === 0 && signal === null)) {
          resolve(result);
          return;
        }
        reject(
          new Error(
            `${command} exited with code=${code} signal=${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    });
  });
}

async function runPowerShell(command, options) {
  return runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    options,
  );
}

async function getProcessIds() {
  const result = await runPowerShell(
    `Get-Process -Name ${powershellQuote(processName)} -ErrorAction SilentlyContinue | ForEach-Object { Write-Output $_.Id }`,
    { allowFailure: true, timeoutMs: 15_000 },
  );
  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

async function stopStudioProcesses() {
  await runCommand('taskkill.exe', ['/F', '/T', '/IM', executableName], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  await waitFor(async () => (await getProcessIds()).length === 0, {
    timeoutMs: 30_000,
    label: 'Studio processes to exit',
  }).catch(() => undefined);
}

async function findFileRecursively(rootDir, fileName, maxDepth = 4) {
  if (!rootDir || !existsSync(rootDir)) return null;
  const queue = [{ depth: 0, dir: rootDir }];

  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await fs.readdir(current.dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current.dir, entry.name);
      if (
        entry.isFile() &&
        entry.name.toLowerCase() === fileName.toLowerCase()
      ) {
        return entryPath;
      }
      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ depth: current.depth + 1, dir: entryPath });
      }
    }
  }

  return null;
}

async function locateInstalledExecutable({ required = true } = {}) {
  const programsDir = path.join(process.env.LOCALAPPDATA ?? '', 'Programs');
  const candidates = [
    path.join(programsDir, 'midscene-studio-beta', executableName),
    path.join(programsDir, 'Midscene Studio Beta', executableName),
  ];
  const exactMatch = candidates.find((candidate) => existsSync(candidate));
  if (exactMatch) return exactMatch;

  const recursiveMatch = await findFileRecursively(programsDir, executableName);
  if (recursiveMatch) return recursiveMatch;
  if (!required) return null;
  throw new Error(`Unable to find ${executableName} below ${programsDir}`);
}

async function getExecutableVersion(executablePath) {
  const result = await runPowerShell(
    `(Get-Item -LiteralPath ${powershellQuote(executablePath)}).VersionInfo.ProductVersion`,
    { timeoutMs: 15_000 },
  );
  const match = result.stdout.match(/\d+\.\d+\.\d+/);
  if (!match) {
    throw new Error(
      `Unable to parse product version from ${JSON.stringify(result.stdout)}`,
    );
  }
  return match[0];
}

async function uninstallStudio(executablePath) {
  if (!executablePath) return;
  await stopStudioProcesses();
  const installDir = path.dirname(executablePath);
  const entries = await fs.readdir(installDir, { withFileTypes: true });
  const uninstaller = entries.find(
    (entry) => entry.isFile() && /^Uninstall .*\.exe$/i.test(entry.name),
  );
  if (!uninstaller) return;
  await runCommand(path.join(installDir, uninstaller.name), ['/S'], {
    allowFailure: true,
    timeoutMs: 90_000,
  });
}

function parseRange(rangeHeader, fileSize) {
  if (!rangeHeader) {
    return { end: fileSize - 1, start: 0, statusCode: 200 };
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  const end = Math.min(requestedEnd, fileSize - 1);
  if (!Number.isInteger(start) || start < 0 || start > end) return null;
  return { end, start, statusCode: 206 };
}

async function startUpdateServer({ artifactDir, diagnosticsDir, fileNames }) {
  const allowedFiles = new Set(fileNames);
  const requests = [];
  const requestLogPath = path.join(diagnosticsDir, 'http-requests.ndjson');

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const fileName = decodeURIComponent(requestUrl.pathname).replace(
        /^\/+/,
        '',
      );
      if (
        !allowedFiles.has(fileName) ||
        fileName !== path.basename(fileName) ||
        !['GET', 'HEAD'].includes(request.method ?? '')
      ) {
        response.writeHead(404).end();
        return;
      }

      const filePath = path.join(artifactDir, fileName);
      const stats = await fs.stat(filePath);
      const range = parseRange(request.headers.range, stats.size);
      if (!range) {
        response
          .writeHead(416, { 'Content-Range': `bytes */${stats.size}` })
          .end();
        return;
      }

      const entry = {
        at: new Date().toISOString(),
        end: range.end,
        method: request.method,
        path: requestUrl.pathname,
        range: request.headers.range ?? null,
        start: range.start,
        statusCode: range.statusCode,
      };
      requests.push(entry);
      await fs.appendFile(requestLogPath, `${JSON.stringify(entry)}\n`);

      const headers = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': range.end - range.start + 1,
        'Content-Type': fileName.endsWith('.yml')
          ? 'text/yaml; charset=utf-8'
          : 'application/octet-stream',
      };
      if (range.statusCode === 206) {
        headers['Content-Range'] =
          `bytes ${range.start}-${range.end}/${stats.size}`;
      }
      response.writeHead(range.statusCode, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(filePath, { end: range.end, start: range.start }).pipe(
        response,
      );
    } catch (error) {
      response
        .writeHead(500)
        .end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');

  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    requests,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function reserveTcpPort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForCdp(cdpPort) {
  await waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      return response.ok;
    },
    { timeoutMs: 60_000, label: 'Studio CDP endpoint' },
  );
}

async function connectStudioRenderer(cdpPort) {
  await waitForCdp(cdpPort);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${cdpPort}`,
    defaultViewport: null,
  });
  const page = await waitFor(
    async () => {
      const pages = await browser.pages();
      for (const candidate of pages) {
        const hasUpdater = await candidate.evaluate(() =>
          Boolean(window.studioUpdater),
        );
        if (hasUpdater) return candidate;
      }
      return null;
    },
    { timeoutMs: 60_000, label: 'Studio renderer updater API' },
  );
  return { browser, page };
}

function launchStudio(executablePath, cdpPort, logPath) {
  const logStream = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${cdpPort}`,
      '--remote-debugging-address=127.0.0.1',
    ],
    {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    },
  );
  child.stdout.pipe(logStream, { end: false });
  child.stderr.pipe(logStream, { end: false });
  child.on('error', (error) => {
    logStream.write(
      `Failed to launch Studio: ${error.stack ?? error.message}\n`,
    );
  });
  child.once('exit', () => logStream.end());
  return child;
}

async function ensureArtifacts(paths) {
  for (const artifactPath of paths) {
    const stats = await fs.stat(artifactPath);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(`Expected a non-empty artifact: ${artifactPath}`);
    }
  }
}

async function writeSummary(diagnosticsDir, summary) {
  await fs.writeFile(
    path.join(diagnosticsDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('Windows update smoke must run on Windows.');
  }
  if (process.env.MIDSCENE_STUDIO_RUN_WINDOWS_UPDATE_SMOKE !== '1') {
    throw new Error(
      'Set MIDSCENE_STUDIO_RUN_WINDOWS_UPDATE_SMOKE=1 to allow installing the CI fixture.',
    );
  }

  const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--');
  const { values } = parseArgs({
    args: cliArgs,
    allowPositionals: false,
    options: {
      'artifact-dir': { default: defaultArtifactDir, type: 'string' },
      'diagnostics-dir': { default: defaultDiagnosticsDir, type: 'string' },
      'from-version': { type: 'string' },
      'to-version': { type: 'string' },
    },
  });
  if (!values['from-version'] || !values['to-version']) {
    throw new Error('--from-version and --to-version are required.');
  }

  const artifactDir = path.resolve(values['artifact-dir']);
  const diagnosticsDir = path.resolve(values['diagnostics-dir']);
  const fromVersion = normalizeVersion(values['from-version']);
  const toVersion = normalizeVersion(values['to-version']);
  const fromBaseName = `midscene-studio-beta-v${fromVersion}-win32-x64`;
  const toBaseName = `midscene-studio-beta-v${toVersion}-win32-x64`;
  const fromInstallerName = `${fromBaseName}-setup.exe`;
  const toInstallerName = `${toBaseName}-setup.exe`;
  const fromInstallerPath = path.join(artifactDir, fromInstallerName);
  const toInstallerPath = path.join(artifactDir, toInstallerName);
  const latestYmlPath = path.join(artifactDir, 'latest.yml');
  const requiredArtifacts = [
    fromInstallerPath,
    `${fromInstallerPath}.blockmap`,
    toInstallerPath,
    `${toInstallerPath}.blockmap`,
    latestYmlPath,
  ];

  await fs.rm(diagnosticsDir, { force: true, recursive: true });
  await fs.mkdir(diagnosticsDir, { recursive: true });
  await ensureArtifacts(requiredArtifacts);
  await Promise.all([
    fs.copyFile(latestYmlPath, path.join(diagnosticsDir, 'latest.yml')),
    fs.copyFile(
      `${fromInstallerPath}.blockmap`,
      path.join(diagnosticsDir, `${fromInstallerName}.blockmap`),
    ),
    fs.copyFile(
      `${toInstallerPath}.blockmap`,
      path.join(diagnosticsDir, `${toInstallerName}.blockmap`),
    ),
  ]);

  const summary = {
    completedAt: null,
    error: null,
    fromVersion,
    installedExecutable: null,
    phases: [],
    processIds: {},
    startedAt: new Date().toISOString(),
    statuses: [],
    toVersion,
    versions: {},
  };
  const recordPhase = async (name, details = {}) => {
    summary.phases.push({ at: new Date().toISOString(), details, name });
    await writeSummary(diagnosticsDir, summary);
    console.log(`WINDOWS_UPDATE_SMOKE_PHASE:${name}`);
  };

  let browser = null;
  let installedExecutable = null;
  let server = null;

  try {
    await recordPhase('artifacts-ready');
    const previousInstall = await locateInstalledExecutable({
      required: false,
    });
    if (previousInstall) await uninstallStudio(previousInstall);
    await stopStudioProcesses();

    await runCommand(fromInstallerPath, ['/S'], { timeoutMs: 180_000 });
    await stopStudioProcesses();
    installedExecutable = await waitFor(
      () => locateInstalledExecutable({ required: false }),
      { timeoutMs: 60_000, label: 'old Studio installation' },
    );
    summary.installedExecutable = installedExecutable;
    summary.versions.before = await getExecutableVersion(installedExecutable);
    assert.equal(summary.versions.before, fromVersion);
    await recordPhase('old-version-installed', {
      executable: installedExecutable,
      version: summary.versions.before,
    });

    server = await startUpdateServer({
      artifactDir,
      diagnosticsDir,
      fileNames: [
        'latest.yml',
        fromInstallerName,
        `${fromInstallerName}.blockmap`,
        toInstallerName,
        `${toInstallerName}.blockmap`,
      ],
    });
    const appUpdatePath = path.join(
      path.dirname(installedExecutable),
      'resources',
      'app-update.yml',
    );
    await fs.writeFile(
      appUpdatePath,
      `provider: generic\nurl: ${server.url}\nupdaterCacheDirName: midscene-studio-beta-updater\n`,
    );
    await recordPhase('local-update-feed-ready', { url: server.url });

    const cdpPort = await reserveTcpPort();
    launchStudio(
      installedExecutable,
      cdpPort,
      path.join(diagnosticsDir, 'studio-process.log'),
    );
    const connection = await connectStudioRenderer(cdpPort);
    browser = connection.browser;
    const { page } = connection;

    await page.evaluate(() => {
      window.__midsceneWindowsUpdateStatuses = [];
      window.__midsceneStopWindowsUpdateStatuses =
        window.studioUpdater.onStatus((status) =>
          window.__midsceneWindowsUpdateStatuses.push(status),
        );
    });
    const runtimeVersion = await page.evaluate(() =>
      window.studioUpdater.getVersion(),
    );
    assert.equal(runtimeVersion, fromVersion);
    const oldProcessIds = await getProcessIds();
    assert(oldProcessIds.length > 0, 'Expected old Studio processes to run.');
    summary.processIds.before = oldProcessIds;
    await recordPhase('old-version-started', {
      processIds: oldProcessIds,
      runtimeVersion,
    });

    const checkStatus = await page.evaluate(() => window.studioUpdater.check());
    assert.equal(checkStatus.state, 'available');
    assert.equal(checkStatus.version, toVersion);
    assert.notEqual(checkStatus.externalDownloadOnly, true);
    await recordPhase('update-available', { checkStatus });

    const downloadResult = await page.evaluate(() =>
      window.studioUpdater.download(),
    );
    assert.equal(downloadResult.success, true, downloadResult.error);
    const downloadedStatus = await waitFor(
      async () => {
        const status = await page.evaluate(() =>
          window.studioUpdater.getStatus(),
        );
        return status.state === 'downloaded' ? status : null;
      },
      {
        timeoutMs: 180_000,
        label: 'updater downloaded status',
      },
    );
    assert.equal(downloadedStatus.state, 'downloaded');
    assert.equal(downloadedStatus.version, toVersion);
    summary.statuses = await page.evaluate(
      () => window.__midsceneWindowsUpdateStatuses,
    );
    assert(
      summary.statuses.some(
        (status) =>
          status.state === 'downloaded' && status.version === toVersion,
      ),
      'Expected the renderer to receive downloaded status.',
    );
    await recordPhase('update-downloaded', {
      downloadedStatus,
      statuses: summary.statuses,
    });

    await page.evaluate(() => window.studioUpdater.install());
    await recordPhase('quit-and-install-called');
    browser.disconnect();
    browser = null;

    await waitFor(
      async () => {
        const currentIds = await getProcessIds();
        return oldProcessIds.every(
          (processId) => !currentIds.includes(processId),
        );
      },
      { timeoutMs: 180_000, label: 'old Studio processes to exit' },
    );
    summary.versions.after = await waitFor(
      async () => {
        const version = await getExecutableVersion(installedExecutable);
        return version === toVersion ? version : null;
      },
      { timeoutMs: 180_000, label: `installed version ${toVersion}` },
    );
    const restartedProcessIds = await waitFor(
      async () => {
        const currentIds = await getProcessIds();
        const newIds = currentIds.filter(
          (processId) => !oldProcessIds.includes(processId),
        );
        return newIds.length > 0 ? newIds : null;
      },
      { timeoutMs: 180_000, label: 'updated Studio process to restart' },
    );
    summary.processIds.after = restartedProcessIds;

    assert(
      server.requests.some(
        (request) => request.method === 'GET' && request.path === '/latest.yml',
      ),
      'Expected updater to request latest.yml.',
    );
    assert(
      server.requests.some(
        (request) =>
          request.method === 'GET' && request.path === `/${toInstallerName}`,
      ),
      'Expected updater to download the new NSIS installer.',
    );
    await recordPhase('updated-version-restarted', {
      processIds: restartedProcessIds,
      version: summary.versions.after,
    });
    summary.completedAt = new Date().toISOString();
    await writeSummary(diagnosticsDir, summary);
    console.log(
      `WINDOWS_UPDATE_SMOKE_SUCCESS:${fromVersion}->${toVersion}:${restartedProcessIds.join(',')}`,
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.stack : String(error);
    summary.completedAt = new Date().toISOString();
    await writeSummary(diagnosticsDir, summary);
    throw error;
  } finally {
    if (browser) browser.disconnect();
    if (server) await server.close().catch(() => undefined);
    await stopStudioProcesses();
    if (installedExecutable) {
      await uninstallStudio(installedExecutable).catch(async (error) => {
        await fs.appendFile(
          path.join(diagnosticsDir, 'cleanup-errors.log'),
          `${error instanceof Error ? error.stack : String(error)}\n`,
        );
      });
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('Windows Studio update smoke failed:', error);
  process.exitCode = 1;
}
