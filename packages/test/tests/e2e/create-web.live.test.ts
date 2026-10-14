import { execFile } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { load as loadYaml } from 'js-yaml';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(__dirname, '../..');
const workspaceRoot = resolve(packageRoot, '../..');

interface PackageManifest {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: { overrides: Record<string, string> };
}

// Pack the complete runtime dependency graph, so an installed registry release
// cannot silently stand in for any Midscene package changed by this PR.
const runtimePackages = () => {
  const packages = new Map<
    string,
    { root: string; manifest: PackageManifest }
  >();
  for (const entry of readdirSync(join(workspaceRoot, 'packages'))) {
    const root = join(workspaceRoot, 'packages', entry);
    const manifestPath = join(root, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest: PackageManifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    );
    packages.set(manifest.name, { root, manifest });
  }
  const selected = new Map<string, string>();
  const visit = (name: string) => {
    if (selected.has(name)) return;
    const item = packages.get(name);
    if (!item) throw new Error(`Missing workspace package: ${name}`);
    selected.set(name, item.root);
    for (const dependency of Object.keys({
      ...item.manifest.dependencies,
      ...item.manifest.optionalDependencies,
    })) {
      if (dependency.startsWith('@midscene/')) visit(dependency);
    }
  };
  visit('@midscene/test');
  visit('@midscene/web');
  return selected;
};

it('creates, installs, and runs the packaged Web starter with a real browser and model', async () => {
  loadEnv({ path: join(workspaceRoot, '.env') });
  const temporary = mkdtempSync(join(tmpdir(), 'midscene-create-web-'));
  const artifactRoot = resolve(
    process.env.MIDSCENE_CREATE_E2E_ARTIFACT_DIR ??
      join(packageRoot, 'midscene_run/create-web'),
  );
  mkdirSync(artifactRoot, { recursive: true });
  const artifacts = mkdtempSync(join(artifactRoot, 'run-'));
  const project = join(temporary, 'web');
  // pnpm/Vitest can add workspace dependencies to NODE_PATH. The child must
  // resolve only the dependencies that were actually installed in its project.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HEADLESS: 'true',
    NODE_PATH: undefined,
  };

  const run = async (
    label: string,
    args: string[],
    cwd: string,
    timeout = 180_000,
  ) => {
    console.log(`[create Web e2e] ${label}`);
    try {
      const result = await execFileAsync('pnpm', args, {
        cwd,
        env,
        timeout,
        maxBuffer: 20 * 1024 * 1024,
      });
      writeFileSync(
        join(artifacts, `${label}.log`),
        `${result.stdout}\n${result.stderr}`,
      );
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string };
      writeFileSync(
        join(artifacts, `${label}.log`),
        `${failure.stdout ?? ''}\n${failure.stderr ?? ''}\n${failure.message}`,
      );
      throw error;
    }
  };

  try {
    const archives = join(temporary, 'packages');
    mkdirSync(archives);
    const overrides: Record<string, string> = {};
    for (const [name, root] of runtimePackages()) {
      const destination = join(archives, name.slice('@midscene/'.length));
      mkdirSync(destination);
      await run(
        `pack-${basename(root)}`,
        ['pack', '--pack-destination', destination],
        root,
      );
      const files = readdirSync(destination).filter((file) =>
        file.endsWith('.tgz'),
      );
      expect(files).toHaveLength(1);
      overrides[name] = `file:${join(destination, files[0])}`;
    }

    // Bootstrap the published CLI shape without borrowing workspace node_modules.
    const bootstrap = join(temporary, 'bootstrap');
    mkdirSync(bootstrap);
    writeFileSync(
      join(bootstrap, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: { '@midscene/test': overrides['@midscene/test'] },
        pnpm: { overrides },
      }),
    );
    await run(
      'install-cli',
      ['install', '--ignore-workspace', '--no-frozen-lockfile'],
      bootstrap,
    );
    await run(
      'create',
      [
        'exec',
        'midscene-test',
        'create',
        project,
        '--platform',
        'web',
        '--package-manager',
        'pnpm',
        '--skip-install',
      ],
      bootstrap,
    );

    const originalFiles = new Map(
      ['midscene.config.ts', 'nodes/todo.ts', 'cases/todo.yaml'].map((file) => [
        file,
        readFileSync(join(project, file), 'utf8'),
      ]),
    );
    const manifestPath = join(project, 'package.json');
    const manifest: PackageManifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    );
    // Only redirect package resolution; keep the generated config, Nodes, YAML,
    // dependencies, and lifecycle scripts intact.
    manifest.pnpm = { overrides };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await run(
      'install-project',
      ['install', '--ignore-workspace', '--no-frozen-lockfile'],
      project,
    );

    const lock = loadYaml(
      readFileSync(join(project, 'pnpm-lock.yaml'), 'utf8'),
    ) as {
      packages: Record<string, { resolution: { tarball?: string } }>;
    };
    for (const [name, archive] of Object.entries(overrides)) {
      const installed = Object.entries(lock.packages).filter(([key]) =>
        key.startsWith(`${name}@`),
      );
      expect(installed.length, `${name} must be installed`).toBeGreaterThan(0);
      for (const [, { resolution }] of installed) {
        const tarball = resolution.tarball;
        if (!tarball?.startsWith('file:')) {
          throw new Error(`${name} was not installed from a local archive.`);
        }
        expect(
          realpathSync(resolve(project, tarball.slice('file:'.length))),
          `${name} must come from this build`,
        ).toBe(realpathSync(archive.slice('file:'.length)));
      }
    }
    const spec = readFileSync(
      join(project, 'midscene-node-spec.web.md'),
      'utf8',
    );
    expect(spec).toContain('## `todo.setup`');
    expect(spec).toContain('## `aiAssert`');
    await run(
      'install-chromium',
      ['exec', 'playwright', 'install', 'chromium'],
      project,
    );

    const resultsRoot = join(project, '.midscene/test-results');
    // Execute the untouched starter, including its AI actions and assertions.
    // Allow its 10-minute case budget plus cleanup/report publication time.
    await run('test', ['test'], project, 660_000);
    const runs = readdirSync(resultsRoot, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    );
    expect(runs).toHaveLength(1);
    const runDir = join(resultsRoot, runs[0].name);
    const result = JSON.parse(
      readFileSync(join(runDir, 'summary.json'), 'utf8'),
    );
    expect(result).toMatchObject({
      status: 'success',
      exitCode: 0,
      summary: {
        total: 2,
        passed: 2,
        failed: 0,
        notRun: 0,
        passedAfterRetry: 0,
        filtered: 0,
        collectionErrors: 0,
        documentFailures: 0,
        projectFailures: 0,
      },
    });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe('web');
    expect(
      result.projects[0].cases.map((item: { name: string }) => item.name),
    ).toEqual([
      'Seed TodoMVC with deterministic Nodes',
      'Manage TodoMVC with AI',
    ]);
    expect(result.report).toEqual(expect.any(String));
    expect(readFileSync(resolve(runDir, result.report), 'utf8')).toMatch(
      /<!doctype html>/i,
    );
    expect(readFileSync(join(runDir, 'result.md'), 'utf8')).toContain(
      'Manage TodoMVC with AI',
    );
    for (const [file, content] of originalFiles) {
      expect(readFileSync(join(project, file), 'utf8')).toBe(content);
    }
  } finally {
    // Always retain the generated source, run facts, screenshots, and HTML,
    // including failures. Never upload credentials or installed dependencies.
    try {
      if (existsSync(project)) {
        cpSync(project, join(artifacts, 'project'), {
          recursive: true,
          filter: (source) =>
            !relative(project, source)
              .split(sep)
              .some(
                (part) =>
                  part === 'node_modules' ||
                  part === '.env' ||
                  part.startsWith('.env.'),
              ),
        });
      }
      console.log(`[create Web e2e] artifacts: ${artifacts}`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});
