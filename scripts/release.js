const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const dayjs = require('dayjs');
const args = require('minimist')(process.argv.slice(2));
const bumpPrompt = require('@jsdevtools/version-bump-prompt');
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
    console.error(chalk.red(`Error executing ${bin} ${args.join(' ')}`));
    throw error;
  }
};

const currentVersion = require('../package.json').version;

const actionPublishCanary =
  ['preminor', 'prepatch'].includes(args.version) && process.env.CI;

async function main() {
  try {
    step('\nSelect bumpVersion...');
    const selectVersion = await bumpVersion();
    if (selectVersion) {
      step(
        `\nbumpVersion ${selectVersion.oldVersion} => ${selectVersion.newVersion}...`,
      );
    }

    step('\nBump extension version...');
    await bumpExtensionVersion(selectVersion.newVersion);

    step('\nBuilding all packages...');
    await build();

    step('\nRunning tests...');
    await test();

    step('\nLinting all packages...');
    await lint();

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
          `release: v${selectVersion.newVersion}`,
        ]);
      }
    } else {
      console.log('No changes to commit.');
    }

    if (selectVersion) {
      step('\nPublishing...');
      await publish(selectVersion.newVersion);
    } else {
      console.log('No new version:', selectVersion);
    }

    if (!actionPublishCanary) {
      step('\nPushing to GitHub...');
      await pushToGithub(selectVersion);
    }
  } catch (error) {
    console.error(chalk.red('An error occurred during the release process. Please check the logs for more details.'));
    await cleanup();
    process.exit(1); // Exit with failure
  }

  await cleanup(); // Ensure cleanup after successful execution
}

async function build() {
  try {
    await run('pnpm', ['run', 'build']);
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
    '../packages/visualizer/unpacked-extension/manifest.json',
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

    return await bumpPrompt({
      files: ['package.json', 'packages/*/package.json'],
      release: version || '',
      push: false,
      tag: false,
    });
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

async function publish(version) {
  try {
    step('\nSetting npmrc ...');
    await writeNpmrc();

    let releaseTag = 'latest';
    if (version.includes('alpha')) {
      releaseTag = 'alpha';
    } else if (version.includes('beta')) {
      releaseTag = 'beta';
    } else if (version.includes('rc')) {
      releaseTag = 'rc';
    }

    let publishArgs = [
      '-r',
      'publish',
      '--access',
      'public',
      '--no-git-checks',
    ];
    if (version) {
      publishArgs = publishArgs.concat(['--tag', releaseTag]);
    }

    await run('pnpm', publishArgs);
  } catch (error) {
    console.error(chalk.red(`Error publishing version ${version}`));
    throw error;
  }
}

async function writeNpmrc() {
  if (process.env.CI) {
    try {
      const npmRcPath = `${process.env.HOME}/.npmrc`;
      console.info(
        `Current .npmrc file path is ${npmRcPath}, npm token is ${process.env.NPM_TOKEN}`,
      );
      if (fs.existsSync(npmRcPath)) {
        console.info('Found existing .npmrc file');
      } else {
        console.info('No .npmrc file found, creating one');
        fs.writeFileSync(
          npmRcPath,
          `//registry.npmjs.org/:_authToken=${process.env.NPM_TOKEN}`,
        );
      }
    } catch (error) {
      console.error(chalk.red('Error setting .npmrc'));
      throw error;
    }
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
