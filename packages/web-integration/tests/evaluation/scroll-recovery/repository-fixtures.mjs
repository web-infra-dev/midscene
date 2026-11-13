import { readFileSync } from 'node:fs';

// Reuse existing repository pages unchanged. The appended script is an outcome
// oracle only; none of its fields are provided to the model.
export const cases = [
  {
    id: 'repository-narrow-input',
    source: '../../ai/fixtures/narrow-input.html',
    prompt:
      'Enter exactly RIVER-729 into the text input labelled 请输入文本, then stop.',
    goal: ({ value }) => value === 'RIVER-729',
    act: async (page) => page.type('#prompt-input', 'RIVER-729'),
  },
  {
    id: 'repository-disabled-form',
    source: '../../ai/fixtures/disabled-attrs.html',
    prompt:
      'Enter sample-pass into Password, then uncheck I agree to terms. Leave Username and Email unchanged. Do not click Submit or Cancel.',
    goal: ({ password, agreed }) => password === 'sample-pass' && !agreed,
    constraint: ({ username, email, clicks }) =>
      username === 'admin' &&
      email === 'test@example.com' &&
      clicks.length === 0,
    act: async (page) => {
      await page.type('#password', 'sample-pass');
      await page.click('#agree');
    },
  },
  {
    id: 'repository-select',
    source: '../../ai/fixtures/select.html',
    prompt: 'Choose Banana in the Choose a fruit dropdown, then stop.',
    goal: ({ fruit, result }) =>
      fruit === 'banana' && result === 'Current selection: Banana',
    act: async (page) => page.select('#fruit', 'banana'),
  },
  {
    id: 'repository-login-popup',
    source: '../../ai/web/playwright/__fixtures__/fast-login-popup/index.html',
    prompt:
      'Log in with username demo-user and password demo-password. Close any advertisement that interrupts the login.',
    goal: ({ loginState, username, password }) =>
      loginState === 'signed-in' &&
      username === 'demo-user' &&
      password === 'demo-password',
    act: async (page) => {
      await page.type('#username', 'demo-user');
      await page.waitForFunction(
        () => !document.querySelector('#ad-overlay').hidden,
      );
      await page.click('#close-ad');
      await page.type('#password', 'demo-password');
      await page.click('.login-button');
    },
  },
].map((c) => ({
  ...c,
  family: 'repository',
  split: 'confirmation',
  controlled: false,
  evaluate: ({ final }) => ({
    goalReached: !!final && c.goal(final),
    compliant: !!final && (c.constraint?.(final) ?? true),
  }),
}));

export function fixture(c) {
  const html = readFileSync(new URL(c.source, import.meta.url), 'utf8');
  return `${html}<script>
    const evaluationClicks = [];
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (button) evaluationClicks.push(button.id || button.textContent.trim());
    });
    window.oracle = { ready: true };
    window.snapshot = () => ({
      x: window.scrollX, y: window.scrollY, clicks: [...evaluationClicks],
      value: document.querySelector('#prompt-input')?.value,
      username: document.querySelector('#username')?.value,
      email: document.querySelector('#email')?.value,
      password: document.querySelector('#password')?.value,
      agreed: document.querySelector('#agree')?.checked,
      fruit: document.querySelector('#fruit')?.value,
      result: document.querySelector('#result')?.textContent,
      loginState: document.body.dataset.loginState,
    });
  </script>`;
}
