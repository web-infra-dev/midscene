import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  expandExtraActionPlans,
  extraActionsCacheKey,
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
    const filePath = join(dir, 'extra-action.yaml');
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

  it('loads the documented YAML shape and expands its xpath shortcut', async () => {
    const filePath = await writeExtraAction(`
name: 点击确定按钮
actionName: tap
actionParam:
  - xpath: /path/to/#confirm-button
`);

    const loaded = await loadExtraActions([filePath], [tapAction()]);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].planningAction).toMatchObject({
      name: 'MidsceneExtraAction_1',
      description: expect.stringContaining('点击确定按钮'),
    });
    expect(
      expandExtraActionPlans(
        [
          {
            type: loaded[0].planningAction.name,
            param: {},
            thought: 'confirm the form',
          },
        ],
        loaded,
      ),
    ).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: '点击确定按钮',
            xpath: '/path/to/#confirm-button',
          },
        },
        thought: 'confirm the form',
      },
    ]);
    expect(extraActionsCacheKey(loaded)).toContain('"name":"点击确定按钮"');
  });

  it('keeps non-locator fields at the top level for an Input shortcut', async () => {
    const filePath = await writeExtraAction(`
name: 填写用户名
actionName: input
actionParam:
  - xpath: /html/body/input
    value: Alice
    mode: typeOnly
`);
    const inputAction: DeviceAction = {
      name: 'Input',
      interfaceAlias: 'aiInput',
      paramSchema: z.object({
        value: z.string(),
        locate: getMidsceneLocationSchema().optional(),
        mode: z.enum(['replace', 'clear', 'typeOnly']).default('replace'),
      }),
      call: vi.fn(),
    };

    const [loaded] = await loadExtraActions([filePath], [inputAction]);

    expect(loaded.plans[0].param).toEqual({
      value: 'Alice',
      mode: 'typeOnly',
      locate: {
        prompt: '填写用户名',
        xpath: '/html/body/input',
      },
    });
  });

  it('rejects parameters that do not match the referenced action schema', async () => {
    const filePath = await writeExtraAction(`
name: 填写用户名
actionName: input
actionParam:
  - xpath: /html/body/input
`);
    const inputAction: DeviceAction = {
      name: 'Input',
      interfaceAlias: 'aiInput',
      paramSchema: z.object({
        value: z.string(),
        locate: getMidsceneLocationSchema().optional(),
      }),
      call: vi.fn(),
    };

    await expect(loadExtraActions([filePath], [inputAction])).rejects.toThrow(
      `Invalid extra action file "${filePath}": "actionParam[0]" does not match action "Input": value: Required`,
    );
  });

  it('rejects display names that can corrupt the planner protocol', async () => {
    const filePath = await writeExtraAction(`
name: Click <Confirm>
actionName: Tap
actionParam:
  - prompt: confirm button
`);

    await expect(loadExtraActions([filePath], [tapAction()])).rejects.toThrow(
      '"name" must not contain angle brackets, line breaks, or control characters',
    );
  });

  it('rejects an unknown referenced action with the source path', async () => {
    const filePath = await writeExtraAction(`
name: 点击确定按钮
actionName: missing-action
actionParam:
  - xpath: /path/to/#confirm-button
`);

    await expect(loadExtraActions([filePath], [tapAction()])).rejects.toThrow(
      `Invalid extra action file "${filePath}": action "missing-action" is not in the current action space`,
    );
  });

  it('rejects duplicate extra action names', async () => {
    const firstPath = await writeExtraAction(`
name: 点击确定按钮
actionName: Tap
actionParam:
  - locate:
      prompt: confirm button
`);
    const secondPath = await writeExtraAction(`
name: 点击确定按钮
actionName: Tap
actionParam:
  - locate:
      prompt: another confirm button
`);

    await expect(
      loadExtraActions([firstPath, secondPath], [tapAction()]),
    ).rejects.toThrow(
      'action name "点击确定按钮" conflicts with another action',
    );
  });
});
