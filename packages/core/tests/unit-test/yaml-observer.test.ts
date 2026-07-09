import { ScriptPlayer } from '@/yaml/player';
import { parseYamlScript } from '@/yaml/utils';
import { describe, expect, it, vi } from 'vitest';

const createAgent = (observer: Record<string, any>) =>
  ({
    reportFile: '/tmp/yaml-observer-report.html',
    dump: { executions: [] },
    onTaskStartTip: undefined,
    getActionSpace: vi.fn(async () => []),
    startObserving: vi.fn(async () => observer),
    aiAssert: vi.fn(async () => ({
      pass: true,
      thought: 'plain assert',
      message: undefined,
    })),
    aiBoolean: vi.fn(async () => false),
    recordErrorToReport: vi.fn(async () => undefined),
    _unstableLogContent: vi.fn(() => ({ logs: [] })),
  }) as any;

describe('YAML observer flow', () => {
  it('routes observed aiAssert and aiBoolean steps through the named observer', async () => {
    const observer = {
      stop: vi.fn(async () => undefined),
      aiAssert: vi.fn(async () => ({
        pass: true,
        thought: 'observed assert',
        message: undefined,
      })),
      aiBoolean: vi.fn(async () => true),
    };
    const agent = createAgent(observer);
    const script = parseYamlScript(`
web:
  url: about:blank
tasks:
  - name: Observe submit flow
    flow:
      - startObserving: submit-flow
        intervalMs: 250
        maxFrames: 8
        watchdogMs: 5000
      - stopObserving: submit-flow
      - aiAssert: a success toast appeared during the submit flow
        observe: submit-flow
        errorMessage: Missing success toast
        name: submit_assertion
      - aiBoolean: did a success toast appear during the submit flow?
        observe: submit-flow
        name: saw_success_toast
        domIncluded: false
`);

    const player = new ScriptPlayer(script, async () => ({
      agent,
      freeFn: [],
    }));

    await player.run();

    expect(player.status).toBe('done');
    expect(agent.startObserving).toHaveBeenCalledWith({
      intervalMs: 250,
      maxFrames: 8,
      watchdogMs: 5000,
    });
    expect(observer.stop).toHaveBeenCalled();
    expect(observer.aiAssert).toHaveBeenCalledWith(
      'a success toast appeared during the submit flow',
      'Missing success toast',
      {
        keepRawResponse: true,
      },
    );
    expect(observer.aiBoolean).toHaveBeenCalledWith(
      'did a success toast appear during the submit flow?',
      {
        domIncluded: false,
      },
    );
    expect(agent.aiAssert).not.toHaveBeenCalled();
    expect(agent.aiBoolean).not.toHaveBeenCalled();
    expect(player.result).toMatchObject({
      submit_assertion: {
        pass: true,
        thought: 'observed assert',
        message: undefined,
      },
      saw_success_toast: true,
    });
  });
});
