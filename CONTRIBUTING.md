# Midscene Contribution Guide

Thanks for showing interest in contributing to Midscene. Before starting your contribution, please take a moment to read the following guidelines.

---

## Setup the Environment

### Fork the Repo

[Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
own GitHub account and then [clone](https://help.github.com/articles/cloning-a-repository/) it to your local machine.

### Install Node.js

We recommend using Node.js 20.9.0. You can check your currently used Node.js version with the following command:

```bash
node -v
```

If you do not have Node.js installed in your current environment, you can use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to install it.

Here is an example of how to install the Node.js 20.9.0 version via nvm:

```bash
# Install the LTS version of Node.js 20
nvm install 20.9.0 --lts

# Make the newly installed Node.js 20 as the default version
nvm alias default 20.9.0

# Switch to the newly installed Node.js 20
nvm use 20.9.0
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
pnpm run build
```

### `REPLACE_ME_WITH_REPORT_HTML` error in the report file

If you see `REPLACE_ME_WITH_REPORT_HTML` in the report file, it's usually because of the circular dependency issue of Midscene. You can rebuild the entire project without nx cache to solve this issue.

```sh
# Rebuild the entire project without cache
pnpm run build:skip-cache
```

---

### Testing

To change the AI-related code of this repository, you need to create a '.env 'file in the root directory, which reads as follows:

```
OPENAI_API_KEY="your_token"
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
pnpm run test:ai
```

You can also run the unit tests of a single package:

```sh
npx nx test @midscene/web
# Test with AI-related features, it will need to create a .env file
npx nx test:ai @midscene/web
```

### Run E2E Tests

Midscene uses

- [playwright](https://github.com/microsoft/playwright) to run end-to-end tests.
- [adb](https://developer.android.com/tools/adb) to run end-to-end tests on Android.

You can run the `e2e` command to run E2E tests for playwright:

```sh
pnpm run e2e
```

If you need to run a specified test:

```sh
npx nx e2e @midscene/web
```

If you need to run E2E tests for adb:
> Before running the test, you need to start the adb server first, please refer to the [README.md](./packages/web-integration/README.md) for details.

```sh
cd packages/web-integration && pnpm run test:ai -- adb
```

---

## Linting

To help maintain consistency and readability of the codebase, we use [Biome](https://github.com/biomejs/biome) to lint the codes.

You can run the linter by executing the following command:

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

### Format of PR titles and Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for PR titles and commit messages. This helps in automating changelog generation and keeps the commit history clean and understandable.

**Structure:**

```
<type>(<scope>): <subject>
^    ^       ^
|    |       |__ Subject: Concise description of the change (imperative mood, lowercase).
|    |__________ Scope: The specific part of the codebase affected. **This is mandatory.**
|_______________ Type: Indicates the kind of change.
```

**Allowed Types:**

*   `feat`: A new feature.
*   `fix`: A bug fix.
*   `refactor`: Code changes that neither fix a bug nor add a feature.
*   `chore`: Changes to the build process, auxiliary tools, libraries, documentation generation etc.
*   `docs`: Documentation only changes.
*   Other conventional types like `perf`, `style`, `test`, `ci`, `build` are also acceptable.

**Mandatory & Allowed Scopes:**

Every commit **must** include a scope. The scope must be one of the following:

*   `workflow`
*   `llm`
*   `playwright`
*   `puppeteer`
*   `mcp`
*   `bridge`
*   *(All top-level directories in the apps and packages directories)*
*   *(Consider adding other relevant top-level packages or areas here if needed)*

**Examples:**

*   `feat(mcp): add screenshot tool with element selection`
*   `fix(android): correct adb connection issue on windows`
*   `refactor(llm): simplify prompt generation logic`
*   `chore(workflow): update commitlint configuration`
*   `docs(bridge): clarify AgentOverChromeBridge usage`

Your commit will be rejected by a pre-commit hook if it doesn't adhere to these rules.

---

## Versioning

All Midscene packages will use a fixed unified version.

The release notes are automatically generated by [GitHub releases](https://github.com/web-infra-dev/midscene/releases).

## Releasing

Repository maintainers can publish a new version of all packages to npm.

Here are the steps to publish (we generally use CI for releases and avoid publishing npm packages locally):

1. [Run the release action](https://github.com/web-infra-dev/midscene/actions/workflows/release.yml).
2. [Generate the release notes](https://github.com/web-infra-dev/midscene/releases).

## Chrome Extension

### Directory Structure

```
midscene/
├── apps/
│   ├── chrome-extension/    # Chrome extension application
│   │   ├── dist/            # Build output directory
│   │   ├── extension/       # Packaged Chrome extension directory
│   │   ├── scripts/         # Build and utility scripts
│   │   ├── src/             # Source code
│   │   │   ├── extension/   # Chrome extension-specific code
│   │   │   └── ...
│   │   ├── static/          # Static resources
│   │   └── ...
│   └── ...
├── packages/
│   ├── core/                # Core functionality
│   ├── visualizer/          # Visualization components
│   ├── web-integration/     # Web integration
│   └── ...
└── ...
```

### Developing the Chrome DevTools Extension

The Chrome DevTools extension uses the Rsbuild build system. Development workflow is as follows:

1. **Build base packages**:
```sh
# First build the base packages
pnpm run build
```

2. **Development mode**:
```sh
# Navigate to chrome-extension directory
cd apps/chrome-extension

# Start the development server
pnpm run dev
```

3. **Build the extension**:
```sh
# Build the Chrome extension
cd apps/chrome-extension
pnpm run build
```

4. **Install the extension**:

The built `dist` directory can be directly installed as a Chrome extension. In Chrome browser:
- Open `chrome://extensions/`
- Enable "Developer mode" in the top-right corner
- Click "Load unpacked" in the top-left corner
- Select the `apps/chrome-extension/dist` directory

Alternatively, you can use the packaged extension:
- Select the `apps/chrome-extension/extension_output/midscene-extension-v{version}.zip` file

For more detailed information, please refer to [Chrome DevTools README](./apps/chrome-extension/README.md).


## FAQ

### Errors like 'Template does not contain {{dump}} placeholder'

Due to some issues with circular dependencies, you need to execute the full build process within the entire repository to compile the Midscene project, rather than compiling the ⁠@midscene/core package separately.