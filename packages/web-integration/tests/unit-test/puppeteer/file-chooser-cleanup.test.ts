import { Page } from '@/puppeteer/base-page';
import { describe, expect, it, rs } from '@rstest/core';

const { debug } = rs.hoisted(() => ({ debug: rs.fn() }));
rs.mock('@midscene/shared/logger', () => ({
  getDebug: () => debug,
  logMsg: rs.fn(),
}));

const fixture = () => {
  const session = {
    send: rs.fn().mockResolvedValue({ node: { attributes: [] } }),
    on: rs.fn(),
    off: rs.fn(),
    detach: rs.fn().mockResolvedValue(undefined),
  };
  const createCDPSession = rs.fn().mockResolvedValue(session);
  const page = new Page({ createCDPSession } as any, 'puppeteer');
  return { page, session, createCDPSession };
};

describe('Puppeteer file chooser cleanup', () => {
  it('handles detach rejection after the page has already closed', async () => {
    const { page, session } = fixture();
    const error = new Error(
      'Session already detached. Most likely the page has been closed.',
    );
    session.detach.mockRejectedValue(error);
    const registration = await page.registerFileChooserListener(async () => {});
    registration.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(debug).toHaveBeenCalledWith(
      'failed to detach file chooser session: %s',
      error,
    );
  });

  it('disposes each registration only once', async () => {
    const { page, session } = fixture();
    const registration = await page.registerFileChooserListener(async () => {});
    registration.dispose();
    registration.dispose();
    expect(session.detach).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer registration alive when the replaced registration is disposed', async () => {
    const { page, session } = fixture();
    const first = await page.registerFileChooserListener(async () => {});
    const second = await page.registerFileChooserListener(async () => {});
    const listener = session.on.mock.calls[1][1];
    const removedBefore = session.off.mock.calls.length;
    first.dispose();
    expect(
      session.off.mock.calls
        .slice(removedBefore)
        .some((args) => args[1] === listener),
    ).toBe(false);
    expect(session.detach).not.toHaveBeenCalled();
    second.dispose();
    expect(session.off).toHaveBeenLastCalledWith(
      'Page.fileChooserOpened',
      listener,
    );
    expect(session.detach).toHaveBeenCalledTimes(1);
  });

  it('creates a new session after cleanup', async () => {
    const { page, createCDPSession } = fixture();
    const first = await page.registerFileChooserListener(async () => {});
    first.dispose();
    const second = await page.registerFileChooserListener(async () => {});
    expect(createCDPSession).toHaveBeenCalledTimes(2);
    second.dispose();
  });
});
