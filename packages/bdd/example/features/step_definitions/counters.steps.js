const { defineStep } = require('@midscene/bdd');

// A classic `# [no-ai]` step: deterministic code, no AI involved. Must be a
// regular `function` (not an arrow) so `this` is the step context, which
// exposes `getUiAgent`, `attach`, `log`, `dataTable`, and `docString`.
defineStep('the login attempt counter increments', async function () {
  // The demo app counts failed sign-ins in `window.__loginAttempts`. The
  // step context's UI agent is the same Midscene PuppeteerAgent driving the
  // scenario; its `page` is Midscene's web page abstraction, which exposes
  // `evaluateJavaScript(script)` for direct evaluation — a real project
  // would more typically call its own APIs here.
  const agent = await this.getUiAgent();
  const attempts = await agent.page.evaluateJavaScript(
    'window.__loginAttempts',
  );
  if (!(attempts >= 1)) {
    throw new Error(
      `expected window.__loginAttempts >= 1 after a failed sign-in, got ${attempts}`,
    );
  }
  await this.log(`login attempt counter = ${attempts}`);
});
