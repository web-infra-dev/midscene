const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const semver = require('semver');
const dayjs = require('dayjs');
const args = require('minimist')(process.argv.slice(2));
const { execa } = require('@esm2cjs/execa');
const chalk = require('chalk');

const step = (msg) => {
  console.log(chalk.cyan(msg));
};

const run = async (bin, args, opts = {}) => {
  try {
    const returnValue = await execa(bin, args, {
      stdio: 'inherit',
      ...opts,
    });
    if (returnValue.failed) {
      throw new Error(`Failed to run ${bin} ${args.join(' ')}`);
    }
    return returnValue;
  } catch (error) {
    console.error(
      chalk.red(
        'Error executing command. Please check the logs for more details.',
      ),
    );
    throw error;
  }
};

const currentVersion = require('../package.json').version;
const benchmarkDataset = '@midscene/benchmark-grounding';

const actionPublishCanary =
  ['preminor', 'prepatch'].includes(args.version) && process.env.CI;

async function main() {
  try {
    const { readHighlights, prepareReleaseNotes } = await import(
      './release-notes.mjs'
    );
    const root = path.resolve(__dirname, '..');
    // Check the requested release type before the version bump edits files.
    if (['major', 'minor'].includes(args.version)) {
      readHighlights(
        root,
        semver.inc(currentVersion, args.version),
        args.version,
      );
    }
    step('\nSelect bumpVersion...');
    const selectVersion = await bumpVersion();
    if (selectVersion) {
      step(
        `\nbumpVersion ${selectVersion.oldVersion} => ${selectVersion.newVersion}...`,
      );
    }
    validateBenchmarkReleaseVersion(selectVersion.newVersion);

    if (!semver.prerelease(selectVersion.newVersion)) {
      readHighlights(root, selectVersion.newVersion, args.version);
    }

    step('\nBump extension version...');
    await bumpExtensionVersion(selectVersion.newVersion);

    step('\nBuilding all packages...');
    await build();

    // Check if this is a prepatch version
    const isPrepatchVersion =
      selectVersion?.newVersion &&
      (selectVersion.newVersion.includes('beta') ||
        args.version === 'prepatch');

    if (isPrepatchVersion) {
      step(
        chalk.yellow('\nSkipping tests and linting for prepatch version...'),
      );
      console.log(
        chalk.yellow(
          `Prepatch version detected: ${selectVersion.newVersion}. Tests and linting will be skipped to speed up the release process.`,
        ),
      );
    } else {
      step('\nRunning tests...');
      await test();

      if (!semver.prerelease(selectVersion.newVersion)) {
        step('\nArchiving bilingual release notes...');
        const { stdout: targetCommit } = await run(
          'git',
          ['rev-parse', 'HEAD'],
          { stdio: 'pipe' },
        );
        const { stdout: tags } = await run(
          'git',
          ['tag', '--merged', 'HEAD', '--list', 'v*'],
          { stdio: 'pipe' },
        );
        const previousTag = tags
          .split('\n')
          .filter(
            (tag) =>
              semver.valid(tag) &&
              !semver.prerelease(tag) &&
              semver.lt(tag, selectVersion.newVersion),
          )
          .sort(semver.rcompare)[0];
        await prepareReleaseNotes({
          root,
          version: selectVersion.newVersion,
          releaseType: args.version,
          repository: process.env.GITHUB_REPOSITORY,
          token: process.env.GITHUB_TOKEN,
          targetCommit: targetCommit.trim(),
          previousTag,
          outputDirectory:
            process.env.RUNNER_TEMP || path.join(root, '.release/notes'),
        });
      }

      step('\nLinting all packages...');
      await lint();
    }

    const { stdout } = await run('git', ['diff'], {
      stdio: 'pipe',
    });
    if (stdout) {
      if (process.env.CI) {
        step('\nSetting git info...');
        await run('git', [
          'config',
          '--global',
          'user.name',
          process.env.GIT_USER_NAME || 'github-actions[bot]',
        ]);
        await run('git', [
          'config',
          '--global',
          'user.email',
          process.env.GIT_USER_EMAIL ||
            'github-actions[bot]@users.noreply.github.com',
        ]);
      }
      step('\nCommitting changes...');
      if (!actionPublishCanary) {
        await run('git', ['add', '-A']);
        await run('git', [
          'commit',
          '-m',
          `chore(workflow): release v${selectVersion.newVersion}\n\nCo-Authored-By: Riff`,
        ]);
      }
    } else {
      console.log('No changes to commit.');
    }

    if (!actionPublishCanary && selectVersion) {
      // Push version bump commit and tag before npm publish.
      // If push fails (e.g. remote has new commits), nothing is published
      // yet, so the release can be safely retried.
      step('\nPushing to GitHub...');
      await pushToGithub(selectVersion);
    }

    if (selectVersion) {
      step('\nPublishing...');
      await publish(selectVersion.newVersion);

      step('\nWriting version marker file...');
      await createVersionMarkerFile(selectVersion.newVersion);
    } else {
      console.log('No new version:', selectVersion);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `An error occurred during the release process: ${error.message}`,
      ),
    );
    await cleanup();
    process.exit(1); // Exit with failure
  }

  await cleanup(); // Ensure cleanup after successful execution
}

async function build() {
  try {
    await run('pnpm', ['run', 'build']);
    await run('node', ['scripts/validate-core-report-template.mjs']);
  } catch (error) {
    console.error(chalk.red('Error building packages'));
    throw error;
  }
}

async function lint() {
  try {
    await run('pnpm', ['run', 'lint']);
  } catch (error) {
    console.error(chalk.red('Error linting packages'));
    throw error;
  }
}

async function test() {
  try {
    await run('pnpm', ['test']);
  } catch (error) {
    console.error(chalk.red('Error running tests'));
    throw error;
  }
}

async function bumpExtensionVersion(newNpmVersion) {
  const manifestPath = path.join(
    __dirname,
    '../apps/chrome-extension/static/manifest.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const [a, b] = manifest.version.split('.').map(Number);
  const newVersion = `${a}.${b + 1}`;
  console.log(
    `newNpmVersion: ${newNpmVersion}, new extension version: ${newVersion}`,
  );
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function bumpVersion() {
  try {
    let version = args.version;
    if (version && actionPublishCanary) {
      const hash = dayjs().format('YYYYMMDDHHmmss');
      version = semver.inc(currentVersion, version, `beta-${hash}`);
    }

    const { bumpReleaseVersion } = await import('./bump-release-version.mjs');
    return await bumpReleaseVersion(path.resolve(__dirname, '..'), version);
  } catch (error) {
    console.error(chalk.red('Error bumping version'));
    throw error;
  }
}

async function pushToGithub(selectVersion) {
  try {
    await run('git', ['tag', `v${selectVersion.newVersion}`]);
    await run('git', ['push']);
    await run('git', ['push', 'origin', '--tags']);
  } catch (error) {
    console.error(chalk.red('Error pushing to GitHub'));
    throw error;
  }
}

function validateBenchmarkReleaseVersion(version) {
  const cli = require('../packages/cli/package.json');
  const dataset = require('../packages/benchmark-grounding/package.json');
  if (cli.version !== version || dataset.version !== version) {
    throw new Error(
      `Release ${version} requires matching versions for ${cli.name} (${cli.version}) and ${dataset.name} (${dataset.version})`,
    );
  }
}

async function waitForBenchmarkDataset(version) {
  const spec = `${benchmarkDataset}@${version}`;
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(benchmarkDataset)}`;
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const metadata = await fetch(registryUrl, {
        headers: {
          accept: 'application/vnd.npm.install-v1+json',
          'cache-control': 'no-cache',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!metadata.ok)
        throw new Error(`npm metadata returned HTTP ${metadata.status}`);
      const tarball = (await metadata.json()).versions?.[version]?.dist
        ?.tarball;
      if (!tarball) throw new Error(`${spec} is missing from npm metadata`);
      const response = await fetch(tarball, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new Error(`npm tarball returned HTTP ${response.status}`);
      return;
    } catch (cause) {
      if (attempt === attempts) {
        throw new Error(
          `${spec} is not downloadable from npm: ${cause.message}`,
          { cause },
        );
      }
    }
    await delay(5_000);
  }
}

async function publish(version) {
  try {
    let releaseTag = 'latest';
    if (version.includes('alpha')) {
      releaseTag = 'alpha';
    } else if (version.includes('beta')) {
      releaseTag = 'beta';
    } else if (version.includes('rc')) {
      releaseTag = 'rc';
    }

    // Validate version: do not allow publishing 2.x stable releases (latest tag)
    // Only allow beta versions (prepatch) for 2.x
    const majorVersion = semver.major(version);
    if (majorVersion === 2 && releaseTag === 'latest') {
      const errorMsg = `Publishing 2.x stable releases (latest tag) is not allowed. Current version: ${version}. Only beta versions (prepatch) are allowed for 2.x.`;
      console.error(chalk.red(errorMsg));
      throw new Error(errorMsg);
    }

    // npm Trusted Publishers generate provenance automatically for GitHub
    // Actions publishes. Do not pass `--provenance` explicitly here: npm 11
    // already creates the transparency-log entry for trusted publishing, and
    // an extra flag can make the publish fail with a duplicate tlog entry.
    const publishArgs = [
      '-r',
      'publish',
      '--access',
      'public',
      '--no-git-checks',
      '--tag',
      releaseTag,
    ];

    // The CLI downloads the exact matching dataset version from npm at runtime.
    await run('pnpm', [
      '--filter',
      benchmarkDataset,
      '--fail-if-no-match',
      ...publishArgs,
    ]);
    step(`\nChecking npm availability of ${benchmarkDataset}@${version}...`);
    await waitForBenchmarkDataset(version);
    await run('pnpm', ['--filter', `!${benchmarkDataset}`, ...publishArgs]);
  } catch (error) {
    console.error(chalk.red(`Error publishing version ${version}`));
    throw error;
  }
}

async function createVersionMarkerFile(version) {
  const extensionOutputDir = path.join(
    __dirname,
    '../apps/chrome-extension/extension_output',
  );
  const versionFilePath = path.join(extensionOutputDir, version);

  try {
    // Ensure the output directory exists before writing the version marker
    fs.mkdirSync(extensionOutputDir, { recursive: true });
    fs.writeFileSync(versionFilePath, version, 'utf8');
    console.log(`Version marker file created at: ${versionFilePath}`);
  } catch (error) {
    console.error(chalk.red('Error creating version marker file'));
    throw error;
  }
}

async function cleanup() {
  try {
    step('\nCleaning up...');
    await run('rm', ['-rf', 'dist']);
  } catch (error) {
    console.error(chalk.red('Error during cleanup'));
    throw error;
  }
}

main().catch((err) => {
  console.error(chalk.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
