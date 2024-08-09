const fs = require('node:fs');
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
  return await execa(bin, args, { stdio: 'inherit', ...opts });
};

const currentVersion = require('../package.json').version;

const actionPublishCanary =
  ['preminor', 'prepatch'].includes(args.version) && process.env.CI;

async function main() {
  // build all packages with types
  step('\nSelect bumpVersion...');
  const selectVersion = await bumpVersion();
  if (selectVersion) {
    step(
      `\nbumpVersion ${selectVersion.oldVersion} => ${selectVersion.newVersion}...`,
    );
  }

  // run tests before release
  step('\nRunning tests...');
  await test();

  // build all packages with types
  step('\nBuilding all packages...');
  await build();

  const { stdout } = await run('git', ['diff'], { stdio: 'pipe' });
  if (stdout) {
    if (process.env.CI) {
      step('\nSetting git info...');
      await run('git', [
        'config',
        '--global',
        'user.name',
        'github-actions[bot]',
      ]);
      await run('git', [
        'config',
        '--global',
        'user.email',
        'github-actions[bot]@users.noreply.github.com',
      ]);
    }
    step('\nCommitting changes...');

    // canary don't need to push
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
    // canary don't need to push
    // push to GitHub
    step('\nPushing to GitHub...');
    await pushToGithub(selectVersion);
  }
}

async function build() {
  await run('pnpm', ['run', 'build:pkg']);
}

async function test() {
  await run('pnpm', ['test']);
}

async function bumpVersion() {
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
}

async function pushToGithub(selectVersion) {
  // push to GitHub
  await run('git', ['tag', `v${selectVersion.newVersion}`]);
  await run('git', ['push']);
  await run('git', ['push', 'origin', '--tags']);
}

async function publish(version) {
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
  let publishArgs = ['-r', 'publish', '--access', 'public', '--no-git-checks'];
  if (version) {
    publishArgs = publishArgs.concat(['--tag', releaseTag]);
  }

  await run('pnpm', publishArgs);
}

async function writeNpmrc() {
  if (process.env.CI) {
    const npmRcPath = `${process.env.HOME}/.npmrc`;
    console.info(
      `curring .npmrc file path is ${npmRcPath}, npm token is ${process.env.NPM_TOKEN}`,
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
  }
}

main().catch((err) => {
  console.error(err);
});
