# Midscene Contribution Guide

Thanks for showing interest in contributing to Midscene. Before starting your contribution, please take a moment to read the following guidelines.

---

## Setup the Environment

### Fork the Repo

[Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local.

### Install Node.js

We recommend using Node.js 18.19.0. You can check your currently used Node.js version with the following command:

```bash
node -v
```

If you do not have Node.js installed in your current environment, you can use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to install it.

Here is an example of how to install the Node.js 18.19.0 version via nvm:

```bash
# Install the LTS version of Node.js 20
nvm install 18.19.0 --lts

# Make the newly installed Node.js 20 as the default version
nvm alias default 18.19.0

# Switch to the newly installed Node.js 20
nvm use 18.19.0
```

### Install Dependencies

Enable [pnpm](https://pnpm.io/) with corepack:

```sh
corepack enable
```

Install dependencies:

```sh
pnpm install
```

What this will do:

- Install all dependencies
- Create symlinks between packages in the monorepo
- Run the `prepare` script to build all packages, powered by [nx](https://nx.dev/).

### Set Git Email

Please make sure you have your email set up in `<https://github.com/settings/emails>`. This will be needed later when you want to submit a pull request.

Check that your git client is already configured with the email:

```sh
git config --list | grep email
```

Set the email to global config:

```sh
git config --global user.email "SOME_EMAIL@example.com"
```

Set the email for local repo:

```sh
git config user.email "SOME_EMAIL@example.com"
```

---

## Making Changes and Building

Once you have set up the local development environment in your forked repo, we can start development.

### Checkout A New Branch

It is recommended to develop on a new branch, as it will make things easier later when you submit a pull request:

```sh
git checkout -b MY_BRANCH_NAME
```

### Build the Package

Use [nx build](https://nx.dev/nx-api/nx/documents/run) to build the package you want to change:

```sh
npx nx build @midscene/web
```

Build all packages:

```sh
pnpm run build:pkg
```

---

### Testing

To change the AI-related code of this repository, you need to create a '.env 'file in the root directory, which reads as follows:

```
OPENAI_API_KEY="you_token"
MIDSCENE_MODEL_NAME="gpt-4o-2024-08-06"
```


### Add New Tests

If you've fixed a bug or added code that should be tested, then add some tests.

You can add unit test cases in the `<PACKAGE_DIR>/tests` folder. The test runner is based on [Vitest](https://vitest.dev/).

### Run Unit Tests

Before submitting a pull request, it's important to make sure that the changes haven't introduced any regressions or bugs. You can run the unit tests for the project by executing the following command:

```sh
pnpm run test
# Test with AI-related features, it will need to create a .env file
pnpm run test:all
```

You can also run the unit tests of a single package:

```sh
npx nx test @midscene/web
# Test with AI-related features, it will need to create a .env file
npx nx test:all @midscene/web
```

### Run E2E Tests

Midscene uses

- [playwright](https://github.com/microsoft/playwright) to run end-to-end tests.
- [appium](https://github.com/appium/appium) to run end-to-end tests on iOS/Android.

You can run the `e2e` command to run E2E tests for playwright:

```sh
pnpm run e2e
```

If you need to run a specified test:

```sh
npx nx e2e @midscene/web
```

If you need to run E2E tests for appium:
> Before running the test, you need to start the appium server first, please refer to the [README.md](./packages/web-integration/README.md) for details.

```sh
cd packages/web-integration && pnpm run test:ai -- appium
```

---

## Linting

To help maintain consistency and readability of the codebase, we use [Biome](https://github.com/biomejs/biome) to lint the codes.

You can run the linters by executing the following command:

```sh
pnpm run lint
```

For VS Code users, you can install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) to see lints while typing.

---

## Documentation

You can find the Rsbuild documentation in the [website](./app/site) folder.

---

## Submitting Changes

### Committing your Changes

Commit your changes to your forked repo, and [create a pull request](https://help.github.com/articles/creating-a-pull-request/).

> Normally, the commits in a PR will be squashed into one commit, so you don't need to rebase locally.

### Format of PR titles

The format of PR titles follow [Conventional Commits](https://www.conventionalcommits.org/).

An example:

```
feat(core): Add `myOption` config
^    ^    ^
|    |    |__ Subject
|    |_______ Scope
|____________ Type
```

---


## Versioning

All Midscene packages will use a fixed unified version.

The release notes are automatically generated by [GitHub releases](https://github.com/web-infra-dev/midscene/releases).

## Releasing

Repository maintainers can publish a new version of all packages to npm.

Here are the steps to publish (we generally use CI for releases and avoid publishing npm packages locally):

1. [Run the release action](https://github.com/web-infra-dev/midscene/actions/workflows/release.yml).
2. [Generate the release notes](https://github.com/web-infra-dev/midscene/releases).

