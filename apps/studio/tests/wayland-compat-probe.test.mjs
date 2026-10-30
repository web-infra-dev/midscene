import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectWayland } from '../scripts/wayland-compat-probe.mjs';

test('does not execute commands on non-Wayland sessions', () => {
  const output = inspectWayland({ XDG_SESSION_TYPE: 'x11' }, () => assert.fail('must not run'));
  assert.equal(output.session, 'not-wayland');
  assert.deepEqual(output.checks, {});
});

test('probes capabilities without reading any text or clipboard contents', () => {
  const calls = [];
  const result = inspectWayland(
    { XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'Hyprland' },
    (name, args) => {
      calls.push([name, args]);
      return { available: true, signal: 'command succeeded' };
    },
  );
  assert.equal(result.session, 'wayland');
  assert.equal(result.compositor, 'Hyprland');
  assert.equal(calls.length, 5);
  assert.ok(calls.some(([name]) => name === 'hyprctl'));
  assert.equal(calls.some(([name]) => ['wl-paste','wtype'].includes(name)), false);
  assert.equal(JSON.stringify(result).includes('text content captured'), true);
});
