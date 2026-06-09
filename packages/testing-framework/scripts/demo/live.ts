/**
 * EXPERIMENTAL live mode for the demo: a real Midscene web UI agent
 * (puppeteer) on the self-contained static shop in example/demo-app, plus the
 * default Pi-backed general agent for verify/soft verdicts.
 *
 * Requires model configuration (at least MIDSCENE_MODEL_BASE_URL — same env
 * the package's AI tests use) and a working puppeteer install. Each scenario
 * gets a fresh browser so login/cart state never leaks between runs. Override
 * the page with DEMO_URL to point at your own app.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PiGeneralAgent } from '../../src/general-agent/pi-general-agent';
import { createUIAgent } from '../../src/ui-agent/factory';

export async function createLiveBundle() {
  if (!process.env.MIDSCENE_MODEL_BASE_URL) {
    throw new Error(
      '[midscene] demo --live needs model configuration (MIDSCENE_MODEL_BASE_URL etc., see the repo .env conventions). Run without --live for the offline reference demo.',
    );
  }

  const url =
    process.env.DEMO_URL ??
    pathToFileURL(join(__dirname, '../../example/demo-app/index.html')).href;

  const { agent, cleanup } = await createUIAgent(
    { type: 'web', options: { url } },
    { generateReport: true },
    process.env,
  );
  const general = new PiGeneralAgent();

  return {
    uiAgent: agent,
    generalAgent: general,
    cleanup: async () => {
      await cleanup?.();
      await general.dispose?.();
    },
  };
}
