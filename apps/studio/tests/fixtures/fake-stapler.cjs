#!/usr/bin/env node
const fs = require('node:fs');

const fixturePath = process.env.MIDSCENE_STAPLER_FIXTURE;
const state = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
state.calls.push(process.argv.slice(2));
fs.writeFileSync(fixturePath, JSON.stringify(state));

const response =
  state.responses[Math.min(state.calls.length - 1, state.responses.length - 1)];
process.stdout.write(response.stdout ?? '');
process.stderr.write(response.stderr ?? '');
process.exitCode = response.code;
