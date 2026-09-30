import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./check-multi-user.sh', import.meta.url));

function check(t, options = {}, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-user-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const adb = path.join(dir, 'adb');
  const log = path.join(dir, 'commands');
  const state = path.join(dir, 'state.json');
  fs.writeFileSync(state, JSON.stringify(options));
  fs.writeFileSync(
    adb,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_LOG, JSON.stringify(args) + '\\n');
const state = JSON.parse(fs.readFileSync(process.env.TEST_STATE, 'utf8'));
const command = args.slice(3);
if (command.join(' ') === 'am get-current-user') {
  console.log(state.user ?? '11');
} else if (command.slice(0, 3).join(' ') === 'pm list packages') {
  if (state.queryError) { console.error('Permission denied'); process.exit(1); }
  const user = command[4];
  const pkg = command[5];
  const missing = (user === '0' && pkg === 'com.midscene.android' && !state.owner)
    || (user === '0' && pkg === 'moe.shizuku.privileged.api' && state.noShizukuOwner)
    || (user === '11' && state.noCurrent);
  if (!missing) console.log('package:' + pkg);
  if (state.similarPackage) console.log('package:' + pkg + '.debug');
} else if (command.join(' ') === 'cmd package install-existing --user 0 com.midscene.android') {
  if (!state.falseSuccess) {
    state.owner = true;
    fs.writeFileSync(process.env.TEST_STATE, JSON.stringify(state));
  }
  console.log('Package com.midscene.android installed for user: 0');
} else { console.error('Unexpected adb command: ' + command.join(' ')); process.exit(1); }
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    'bash',
    [script, '--serial', 'test-device', ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, ADB: adb, TEST_LOG: log, TEST_STATE: state },
    },
  );
  const commands = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  const writes = commands.filter((command) =>
    command.includes('install-existing'),
  );
  return { ...result, commands, writes };
}

test('default check never registers a missing owner package', (t) => {
  const result = check(t);
  assert.equal(result.status, 1);
  assert.equal(result.writes.length, 0);
});

test('explicit repair only registers the Host for user 0 and verifies it', (t) => {
  const result = check(t, {}, ['--register-owner']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.writes.length, 1);
  assert.deepEqual(result.writes[0].slice(3), [
    'cmd',
    'package',
    'install-existing',
    '--user',
    '0',
    'com.midscene.android',
  ]);
});

test('repair is idempotent when both users already have the package', (t) => {
  const result = check(t, { owner: true }, ['--register-owner']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.writes.length, 0);
});

test('a missing prerequisite or failed query never causes a write', (t) => {
  for (const options of [
    { noShizukuOwner: true },
    { noCurrent: true },
    { queryError: true },
  ]) {
    const result = check(t, options, ['--register-owner']);
    assert.equal(result.status, 1);
    assert.equal(result.writes.length, 0);
  }
});

test('installer success text is not enough without package visibility', (t) => {
  const result = check(t, { falseSuccess: true }, ['--register-owner']);
  assert.equal(result.status, 1);
  assert.equal(result.writes.length, 1);
});

test('invalid current user fails before any package query or write', (t) => {
  const result = check(t, { user: 'unknown' }, ['--register-owner']);
  assert.equal(result.status, 1);
  assert.equal(result.commands.length, 1);
});

test('substring package matches cannot hide or impersonate the exact package', (t) => {
  const present = check(t, { owner: true, similarPackage: true });
  assert.equal(present.status, 0, present.stderr);
  const absent = check(t, { similarPackage: true });
  assert.equal(absent.status, 1);
  assert.equal(absent.writes.length, 0);
});
