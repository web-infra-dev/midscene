import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Agent } from '@/agent';
import { markdownToAiActPrompt } from '@/agent/run-markdown';
import { paramStr } from '@/agent/ui-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

let tempDir: string | undefined;

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  (agent as any).aiAct = vi.fn(async () => 'done');
  return agent;
};

const createTempMarkdown = async (content: string) => {
  tempDir = await mkdtemp(join(tmpdir(), 'midscene-run-markdown-'));
  const markdownPath = join(tempDir, 'task.md');
  await writeFile(markdownPath, content);
  return markdownPath;
};

describe('runMarkdown prompt transform', () => {
  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
    vi.restoreAllMocks();
  });

  it('replaces Markdown images with numbered reference image names', async () => {
    const result = await markdownToAiActPrompt(`
# Task

Click the button shown below.

![ignored alt](./fixtures/button.png)

Then compare it with:

![](https://example.com/reference.png)
`);

    expect(result.imageCount).toBe(2);
    expect(result.prompt).toMatchInlineSnapshot(`
      {
        "convertHttpImage2Base64": true,
        "images": [
          {
            "name": "参考图片-001",
            "url": "./fixtures/button.png",
          },
          {
            "name": "参考图片-002",
            "url": "https://example.com/reference.png",
          },
        ],
        "prompt": "# Task

      Click the button shown below.

      参考图片-001

      Then compare it with:

      参考图片-002
      ",
      }
    `);
  });

  it('falls back to the original Markdown string when there are no images', async () => {
    const markdown = '# Task\n\nClick the submit button.\n';

    const result = await markdownToAiActPrompt(markdown);

    expect(result).toEqual({
      prompt: markdown,
      imageCount: 0,
    });
  });

  it('throws when the Markdown contains more than 20 images', async () => {
    const markdown = Array.from(
      { length: 21 },
      (_, index) => `![](./image-${index}.png)`,
    ).join('\n\n');

    await expect(
      markdownToAiActPrompt(markdown, 'too-many.md'),
    ).rejects.toThrow(
      'runMarkdown supports at most 20 images, but found 21 images in too-many.md.',
    );
  });

  it('throws on reference-style images', async () => {
    const markdown = '![target][logo]\n\n[logo]: ./logo.png\n';

    await expect(
      markdownToAiActPrompt(markdown, 'reference.md'),
    ).rejects.toThrow(
      'runMarkdown does not support reference-style image "logo" in reference.md. Use direct image syntax instead.',
    );
  });

  it('reads a Markdown file and forwards the transformed prompt to aiAct', async () => {
    const markdownPath = await createTempMarkdown(
      'Use this target:\n\n![](./target.png)\n',
    );
    const agent = createAgentStub();
    const opt = { cacheable: false };

    await agent.runMarkdown(markdownPath, opt);

    expect(agent.aiAct).toHaveBeenCalledTimes(1);
    expect(agent.aiAct).toHaveBeenCalledWith(
      {
        prompt: 'Use this target:\n\n参考图片-001\n',
        images: [
          {
            name: '参考图片-001',
            url: join(dirname(markdownPath), 'target.png'),
          },
        ],
        convertHttpImage2Base64: true,
      },
      {
        ...opt,
        _internalReportDisplay: {
          type: 'Markdown',
          prompt: 'task.md',
        },
      },
    );
  });

  it('resolves local relative image paths from the Markdown file directory', async () => {
    const markdownPath = await createTempMarkdown(
      'Use local and remote images:\n\n![](./target.png)\n\n![](https://example.com/target.png)\n\n![](data:image/png;base64,abc)\n',
    );

    const result = await markdownToAiActPrompt(
      await readFile(markdownPath, 'utf-8'),
      markdownPath,
    );

    expect(result.prompt).toMatchObject({
      images: [
        {
          name: '参考图片-001',
          url: join(dirname(markdownPath), 'target.png'),
        },
        {
          name: '参考图片-002',
          url: 'https://example.com/target.png',
        },
        {
          name: '参考图片-003',
          url: 'data:image/png;base64,abc',
        },
      ],
    });
  });

  it('passes the Markdown filename as the report display prompt', async () => {
    const markdownPath = await createTempMarkdown(
      'Use this target:\n\n![](./target.png)\n',
    );
    const agent = createAgentStub();

    await agent.runMarkdown(markdownPath, { cacheable: false });

    expect(agent.aiAct).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cacheable: false,
        _internalReportDisplay: {
          type: 'Markdown',
          prompt: 'task.md',
        },
      }),
    );
  });

  it('uses userInstructionDisplay when rendering planning task params', () => {
    expect(
      paramStr({
        type: 'Planning',
        subType: 'Plan',
        param: {
          userInstruction: {
            prompt: 'long markdown prompt',
            images: [{ name: '参考图片-001', url: '/tmp/target.png' }],
          },
          userInstructionDisplay: 'task.md',
        },
      } as any),
    ).toBe('task.md');
  });
});
