# Midscene Android Host

Midscene Android Host runs a Midscene agent inside an APK. It includes Node, the
agent bundle, and a Compose console for prompts, YAML scripts, run history, and
settings. The app runs without a PC or Termux after installation. It supports
arm64 Android 10+; pairing with the device's wireless debugging service requires
Android 11+.

The app uses shell privileges through one of two channels:

| Channel | Setup | Notes |
| --- | --- | --- |
| This device (adb), default | Enable wireless debugging and pair in the app | Works without Shizuku; wireless debugging may need to be enabled again after a reboot. |
| Shizuku | Install and start Shizuku, then authorize Midscene | Some ROMs cannot grant Shizuku's permission; use the adb channel there. |

Both channels execute through the app's loopback bridge. The model credentials
are stored in the app's private `model.env` file and are supplied to the Node
process during a run. They are currently plaintext on the device; avoid using
a production API key on an untrusted device.

## Build a debug APK

Prerequisites: Node and pnpm versions from the repository's root `package.json`,
JDK 17, Android SDK platform 35, Android build tools, Python 3, `zip`, `curl`,
and `tar` (or `ar` for platforms whose `tar` cannot read Debian archives).

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter android-host assemble
```

The APK is written to
`apps/android-host/app/build/outputs/apk/debug/app-debug.apk`. The `assemble`
script builds the workspace package, downloads pinned arm64 Node and adb
packages from Termux, builds the JavaScript bundle, then runs Gradle. Downloads
are verified by SHA-256 and reused from the Git-ignored
`apps/android-host/.cache/termux/` directory. The generated native libraries
live in `.cache/native/` and are packaged by Gradle from there; the APK is
also ignored by Git. A prepared Node runtime can still be supplied
with `pnpm --filter android-host runtime -- --from <runtime-dir>`.

To install it on a connected device:

```bash
pnpm --filter android-host install
```

## First run

1. Open Midscene and follow the setup screen. For the default channel, enable
   **Wireless debugging** in Android developer options.
2. Tap **Start pairing** in Midscene, then open **Wireless debugging → Pair
   device with pairing code**. Keep that screen open and enter its six-digit
   code in the Midscene notification.
3. Return to Midscene, finish provisioning, and set the model Base URL, API
   Key, and model name in **Settings**.
4. Run an instruction from **Run**, or edit and run a YAML config from
   **Scripts**. **Scripts → Self-check** provides a short in-app smoke test.
5. Open **History** to inspect reports and logs. The app retains up to 50 runs
   and 300 MB of run data.

The pairing notification accepts a code plus port when mDNS cannot find the
pairing port. For an existing non-TLS adbd listener, Diagnostics also accepts
an address or port directly.

## Tests

```bash
pnpm exec nx test @midscene/android-local
pnpm exec nx build @midscene/android-local
pnpm exec nx test android-host
pnpm --filter android-host test:android
```

The first three commands run in the regular workspace. The Android JVM tests
require an Android SDK but no native runtime assets. APK behavior should also
be checked on an arm64 device; model-backed runs require configured model
credentials. CI verifies the agent bundle and JVM tests; full APK assembly
also requires the Android SDK and access to the pinned Termux packages.

## Release signing

A release APK must use an explicit signing key. Set `MIDSCENE_KEYSTORE` to the
keystore path and provide `MIDSCENE_KEYSTORE_PASSWORD`,
`MIDSCENE_KEY_ALIAS`, and `MIDSCENE_KEY_PASSWORD`, then run:

```bash
pnpm --filter android-host assemble:release
```

The APK is written to
`apps/android-host/app/build/outputs/apk/release/app-release.apk`. Debug and
release signatures differ, so replacing a debug installation with a release
installation requires uninstalling the debug app first; uninstalling removes
its credentials and pairing key.

For a local test key, `scripts/make-release-keystore.sh` creates a Git-ignored
keystore using the same environment variables. Keep the signing key and its
password outside the repository.

The [`@midscene/android-local` README](../../packages/android-local/README.md)
describes the package API and CLI.
