/** @vitest-environment jsdom */
import { afterEach, expect, it, rs } from '@rstest/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SiwcLoginButton } from '../src/extension/siwc/button';

afterEach(() => {
  rs.restoreAllMocks();
  rs.unstubAllGlobals();
  document.body.innerHTML = '';
});

for (const confirmed of [false, true]) {
  it(`starts authorization only after confirmation (${confirmed})`, async () => {
    rs.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const sendMessage = rs.fn(async () => ({ success: true }));
    rs.stubGlobal('chrome', {
      runtime: { sendMessage },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<SiwcLoginButton />));
    await act(async () => container.querySelector('button')!.click());
    expect(sendMessage).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('ChatGPT plan allowance');
    expect(dialog.textContent).toContain(
      'Authorization will open in a new tab.',
    );
    expect(dialog.querySelector('a')?.href).toBe(
      'https://midscenejs.com/chatgpt-subscription.html',
    );
    const action = Array.from(dialog.querySelectorAll('button')).find(
      (button) =>
        button.textContent === (confirmed ? 'Continue to ChatGPT' : 'Cancel'),
    )!;
    await act(async () => action.click());
    expect(sendMessage).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed) {
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'siwc-login',
      });
    }
    await act(async () => root.unmount());
  });
}
