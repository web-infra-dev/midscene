#!/usr/bin/env node
// Safe, read-only Wayland capability probe. No typing, screenshots, clipboard
// access, input injection, or system configuration changes.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const commands = {
  compositor: ['hyprctl', ['version', '-j']],
  outputs: ['wlr-randr', []],
  inputMethod: ['fcitx5-remote', []],
  virtualKeyboard: ['which', ['wtype']],
  clipboardUtility: ['which', ['wl-copy']],
};

function probe(command, args) {
  try {
    const output = execFileSync(command, args, {
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 65536,
    });
    return { available: true, signal: 'command succeeded' };
  } catch (error) {
    return { available: false, signal: error.code === 'ENOENT' ? 'command not installed' : 'not available or command failed' };
  }
}

export function inspectWayland(env = process.env, run = probe) {
  const session = env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY);
  const result = {
    schemaVersion: 1,
    session: session ? 'wayland' : 'not-wayland',
    compositor: env.XDG_CURRENT_DESKTOP || 'unknown',
    checks: {},
    privacy: 'No key injection, clipboard reads, screenshots, or text content captured',
  };
  if (!session) return result;
  for (const [name, [command, args]] of Object.entries(commands)) {
    result.checks[name] = run(command, args);
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(JSON.stringify(inspectWayland(), null, 2));
}
