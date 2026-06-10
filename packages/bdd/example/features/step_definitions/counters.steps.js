const { defineStep } = require('@midscene/bdd');

// A classic `# @no-ai` step: deterministic code, no AI involved. Must be a
// regular `function` (not an arrow) so `this` is the step context, which
// exposes `vars`, `getUiAgent`, `attach`, and `log`.
defineStep('the login attempt counter increments', async function () {
  // The demo app counts failed sign-ins in `window.__loginAttempts`. The
  // step context's UI agent is the same Midscene PuppeteerAgent driving the
  // scenario, so its underlying page is available for direct evaluation —
  // a real project would more typically call its own APIs here.
  const agent = await this.getUiAgent();
  const attempts = await agent.page.evaluate(() => window.__loginAttempts);
  if (!(attempts >= 1)) {
    throw new Error(
      `expected window.__loginAttempts >= 1 after a failed sign-in, got ${attempts}`,
    );
  }
  await this.log(`login attempt counter = ${attempts}`);
});
