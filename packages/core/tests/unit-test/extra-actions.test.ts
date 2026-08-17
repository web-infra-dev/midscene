import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createExtraActionSnapshot,
  getExtraActionSource,
  loadExtraActions,
} from '@/agent/extra-actions';
import { getMidsceneLocationSchema } from '@/ai-model';
import type { DeviceAction } from '@/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('extra actions', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function writeExtraAction(content: string) {
    const dir = await mkdtemp(join(tmpdir(), 'midscene-extra-action-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'example.actions.yaml');
    await writeFile(filePath, content);
    return filePath;
  }

  const tapAction = (): DeviceAction => ({
    name: 'Tap',
    interfaceAlias: 'aiTap',
    description: 'Tap an element',
    paramSchema: z.object({
      locate: getMidsceneLocationSchema(),
    }),
    call: vi.fn(),
  });

  it('loads the manifest and expands one alias into one native action', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the checkout dialog confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //div[@role="dialog"]//button[@data-testid="confirm"]
    action:
      name: Tap
      param:
        locate:
          prompt: Checkout dialog confirm button
          target:
            strategy: xpath
            selector: //div[@role="dialog"]//button[@data-testid="confirm"]
`);

    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');

    const snapshot = await createExtraActionSnapshot(loaded, {
      probeLocatorTargets: vi.fn(async () => [true]),
    });

    expect(snapshot.actionSpace).toHaveLength(1);
    expect(snapshot.actionSpace[0]).toMatchObject({
      name: 'MidsceneExtraAction_1',
      description: expect.stringContaining(
        'Click the checkout dialog confirm button',
      ),
      sample: {},
    });
    expect(snapshot.actionSpace[0].description).not.toContain('//div');
    expect(loaded[0].validWhenTargetExists).toEqual({
      strategy: 'xpath',
      selector: '//div[@role="dialog"]//button[@data-testid="confirm"]',
    });

    const expansion = snapshot.expandPlans([
      {
        type: 'MidsceneExtraAction_1',
        param: {},
        thought: 'confirm checkout',
      },
    ]);
    expect(expansion.plans).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'Checkout dialog confirm button',
            target: {
              strategy: 'xpath',
              selector: '//div[@role="dialog"]//button[@data-testid="confirm"]',
            },
          },
        },
        thought: 'confirm checkout',
      },
    ]);
    expect(getExtraActionSource(expansion.plans[0])).toEqual({
      type: 'extra-action',
      name: 'Click the checkout dialog confirm button',
      alias: 'MidsceneExtraAction_1',
      sourcePath: filePath,
    });
    expect(snapshot.fingerprint).toMatch(/^extra-actions-snapshot:v1:/);
  });

  it('discloses every action whose condition currently exists', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate:
          prompt: Confirm button
          target: { strategy: xpath, selector: '//button[@id="confirm"]' }
  - name: Click the cancel button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="cancel"]
    action:
      name: Tap
      param:
        locate:
          prompt: Cancel button
          target: { strategy: xpath, selector: '//button[@id="cancel"]' }
  - name: Click the help button
    action:
      name: Tap
      param:
        locate:
          prompt: Help button
          target: { strategy: xpath, selector: '//button[@id="help"]' }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');
    const probeLocatorTargets = vi.fn(
      async (targets: readonly { selector: string }[]) =>
        targets.map((target) => target.selector.includes('confirm')),
    );

    const snapshot = await createExtraActionSnapshot(loaded, {
      probeLocatorTargets,
    });

    expect(probeLocatorTargets).toHaveBeenCalledTimes(1);
    expect(snapshot.actionSpace.map((action) => action.name)).toEqual([
      'MidsceneExtraAction_1',
      'MidsceneExtraAction_3',
    ]);

    probeLocatorTargets.mockImplementation(
      async (targets: readonly { selector: string }[]) =>
        targets.map((target) => target.selector.includes('cancel')),
    );
    const nextSnapshot = await createExtraActionSnapshot(loaded, {
      probeLocatorTargets,
    });
    expect(nextSnapshot.actionSpace.map((action) => action.name)).toEqual([
      'MidsceneExtraAction_2',
      'MidsceneExtraAction_3',
    ]);
  });

  it('keeps each disclosure snapshot immutable across page changes', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate:
          prompt: Confirm button
          target: { strategy: xpath, selector: '//button[@id="confirm"]' }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');
    let exists = false;
    const targetProbe = {
      probeLocatorTargets: vi.fn(async () => [exists]),
    };

    const missingSnapshot = await createExtraActionSnapshot(
      loaded,
      targetProbe,
    );
    exists = true;
    const presentSnapshot = await createExtraActionSnapshot(
      loaded,
      targetProbe,
    );
    const repeatedPresentSnapshot = await createExtraActionSnapshot(
      loaded,
      targetProbe,
    );

    expect(missingSnapshot.actionSpace).toEqual([]);
    expect(presentSnapshot.actionSpace.map((action) => action.name)).toEqual([
      'MidsceneExtraAction_1',
    ]);
    expect(missingSnapshot.fingerprint).not.toBe(presentSnapshot.fingerprint);
    expect(repeatedPresentSnapshot.fingerprint).toBe(
      presentSnapshot.fingerprint,
    );
    expect(
      missingSnapshot.expandPlans([
        { type: 'MidsceneExtraAction_1', param: {} },
      ]),
    ).toEqual({
      plans: [{ type: 'MidsceneExtraAction_1', param: {} }],
      expanded: false,
    });
  });

  it('supports old one-action files as a read compatibility boundary', async () => {
    const filePath = await writeExtraAction(`
name: Click the confirm button
actionName: tap
actionParam:
  - xpath: /html/body/button[1]
`);
    const [loaded] = await loadExtraActions([filePath], [tapAction()], 'web');
    expect(loaded.plan.param).toEqual({
      locate: {
        prompt: 'Click the confirm button',
        target: {
          strategy: 'xpath',
          selector: '/html/body/button[1]',
        },
      },
    });
  });

  it('rejects a manifest for another interface', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: android
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).rejects.toThrow(
      'interface "android" does not match current interface "web"',
    );
  });

  it('accepts the canonical platform declared by an interface', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);

    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).resolves.toHaveLength(1);
  });

  it('prefers an exact native action name over an earlier case-insensitive match', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    const lowerCaseTap = {
      ...tapAction(),
      name: 'tap',
      interfaceAlias: 'lowerCaseTap',
    };

    const [loaded] = await loadExtraActions(
      [filePath],
      [lowerCaseTap, tapAction()],
      'web',
    );

    expect(loaded.plan.type).toBe('Tap');
  });

  it('reserves native action aliases when assigning stable protocol aliases', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    const nativeAction = {
      ...tapAction(),
      interfaceAlias: 'MidsceneExtraAction_1',
    };

    const [loaded] = await loadExtraActions([filePath], [nativeAction], 'web');

    expect(loaded.alias).toBe('MidsceneExtraAction_2');
  });

  it('allows a display name to match a built-in action name', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Tap
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);

    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).resolves.toHaveLength(1);
  });

  it('rejects target and legacy xpath in the same locator', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate:
          prompt: Confirm button
          xpath: //button
          target: { strategy: xpath, selector: //button }
`);
    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).rejects.toThrow(
      '`target` and `xpath` cannot be used in the same locator',
    );
  });

  it('rejects invalid condition targets and duplicate names', async () => {
    const invalidTarget = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists: { strategy: css, selector: '#confirm' }
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    await expect(
      loadExtraActions([invalidTarget], [tapAction()], 'web'),
    ).rejects.toThrow('validWhenTargetExists');

    const duplicate = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Another confirm button }
`);
    await expect(
      loadExtraActions([duplicate], [tapAction()], 'web'),
    ).rejects.toThrow(
      'action name "Click the confirm button" conflicts with another action',
    );
  });

  it('rejects unknown manifest fields before planning', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
unexpected: true
actions:
  - name: Click the confirm button
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);

    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).rejects.toThrow('Unrecognized key');
  });

  it('rejects display names that can break the planning protocol', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: <malicious-action>
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);

    await expect(
      loadExtraActions([filePath], [tapAction()], 'web'),
    ).rejects.toThrow('must not contain angle brackets');
  });

  it('deduplicates condition targets in one batch probe', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the primary confirm button
    validWhenTargetExists: &confirm
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate: { prompt: Primary confirm button }
  - name: Click the secondary confirm button
    validWhenTargetExists: *confirm
    action:
      name: Tap
      param:
        locate: { prompt: Secondary confirm button }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');
    const probeLocatorTargets = vi.fn(async () => [true]);

    const snapshot = await createExtraActionSnapshot(loaded, {
      probeLocatorTargets,
    });

    expect(probeLocatorTargets).toHaveBeenCalledWith(
      [{ strategy: 'xpath', selector: '//button[@id="confirm"]' }],
      {},
    );
    expect(snapshot.actionSpace.map((action) => action.name)).toEqual([
      'MidsceneExtraAction_1',
      'MidsceneExtraAction_2',
    ]);
  });

  it('rejects malformed batch probe results', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');

    await expect(
      createExtraActionSnapshot(loaded, {
        probeLocatorTargets: vi.fn(async () => ['yes'] as any),
      }),
    ).rejects.toThrow('must return only boolean results');
  });

  it('aborts condition probing without returning a partial snapshot', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');
    const controller = new AbortController();
    controller.abort(new Error('test abort'));

    await expect(
      createExtraActionSnapshot(
        loaded,
        { probeLocatorTargets: vi.fn(async () => [true]) },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('test abort');
  });

  it('discards probe results when cancellation happens during the batch', async () => {
    const filePath = await writeExtraAction(`
version: 1
interface: web
actions:
  - name: Click the confirm button
    validWhenTargetExists:
      strategy: xpath
      selector: //button[@id="confirm"]
    action:
      name: Tap
      param:
        locate: { prompt: Confirm button }
`);
    const loaded = await loadExtraActions([filePath], [tapAction()], 'web');
    const controller = new AbortController();
    const probeLocatorTargets = vi.fn(async () => {
      controller.abort(new Error('cancelled during probe'));
      return [true];
    });

    await expect(
      createExtraActionSnapshot(
        loaded,
        { probeLocatorTargets },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('cancelled during probe');
    expect(probeLocatorTargets).toHaveBeenCalledOnce();
  });
});
