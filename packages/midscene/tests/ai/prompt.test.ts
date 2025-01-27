import { systemPromptToTaskPlanning } from '@/ai-model/prompt/llm-planning';
import { descriptionOfTree } from '@/ai-model/prompt/util';
import { NodeType } from '@midscene/shared/constants';
import { describe, expect, it, test } from 'vitest';

describe('automation - computer', () => {
  it('should be able to generate prompt', async () => {
    const prompt = await systemPromptToTaskPlanning();
    // console.log(prompt);
    expect(prompt).toBeDefined();
  });
});

describe('utils', () => {
  const tree = {
    node: {
      attributes: {
        nodeType: NodeType.CONTAINER,
      },
      id: '1',
      indexId: 19,
      rect: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        left: 0,
        top: 0,
      },
      center: [50, 50] as [number, number],
      content:
        'Legend had it that the Whispering Woods held an ancient secret, one that connected the world of man and magic, of reality and dream. Each leaf, every rustling branch, was said to carry the whispers of the ancient spirits who protected the forest. Elara often spent her evenings perched on the boundary stones, listening intently to the murmur of the leaves, wondering what secrets they concealed.',
    },
    children: [
      {
        node: {
          attributes: {
            nodeType: NodeType.TEXT,
            ariaLabel:
              'image description, it could be a long text, very loooooooooooooooooooooooooooooooooooooooooong',
          },
          id: '2',
          indexId: 999,
          rect: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            left: 0,
            top: 0,
          },
          center: [50, 50] as [number, number],
          content: 'world',
        },
        children: [],
      },
      {
        node: {
          attributes: {
            nodeType: NodeType.IMG,
            style: 'width: 100px; height: 100px;',
            src: 'https://example.com/image.jpg',
            htmlTagName: '<img>',
            ariaLabel: 'image description',
            storyContent:
              'Legend had it that the Whispering Woods held an ancient secret, one that connected the world of man and magic, of reality and dream. Each leaf, every rustling branch, was said to carry the whispers of the ancient spirits who protected the forest. Elara often spent her evenings perched on the boundary stones, listening intently to the murmur of the leaves, wondering what secrets they concealed.',
          },
          id: '3',
          indexId: 20,
          rect: {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            left: 0,
            top: 0,
          },
          center: [50, 50] as [number, number],
          content: 'world 2345',
        },
        children: [
          {
            node: {
              attributes: {
                nodeType: NodeType.IMG,
                style: 'width: 100px; height: 100px;',
                src: 'https://example.com/image.jpg',
                htmlTagName: '<img>',
                ariaLabel: 'image description',
                storyContent:
                  'Legend had it that the Whispering Woods held an ancient secret, one that connected the world of man and magic, of reality and dream. Each leaf, every rustling branch, was said to carry the whispers of the ancient spirits who protected the forest. Elara often spent her evenings perched on the boundary stones, listening intently to the murmur of the leaves, wondering what secrets they concealed.',
              },
              id: '3',
              indexId: 20,
              rect: {
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                left: 0,
                top: 0,
              },
              center: [50, 50] as [number, number],
              content: '',
            },
            children: [],
          },
          {
            node: {
              attributes: {
                nodeType: NodeType.IMG,
                style: 'width: 100px; height: 100px;',
                src: 'https://example.com/image.jpg',
                htmlTagName: '<img>',
                ariaLabel: 'image description',
                storyContent:
                  'Legend had it that the Whispering Woods held an ancient secret, one that connected the world of man and magic, of reality and dream. Each leaf, every rustling branch, was said to carry the whispers of the ancient spirits who protected the forest. Elara often spent her evenings perched on the boundary stones, listening intently to the murmur of the leaves, wondering what secrets they concealed.',
              },
              id: '3',
              indexId: 20,
              rect: {
                x: 0,
                y: 0,
                width: 3,
                height: 3,
                left: 0,
                top: 0,
              },
              center: [50, 50] as [number, number],
              content: '',
            },
            children: [],
          },
          {
            node: {
              attributes: {},
              id: '3',
              indexId: 20,
              rect: {
                x: 0,
                y: 0,
                width: 3,
                height: 3,
                left: 0,
                top: 0,
              },
              center: [50, 50] as [number, number],
              content: '',
            },
            children: [
              {
                node: {
                  attributes: {},
                  id: '3',
                  indexId: 20,
                  rect: {
                    x: 0,
                    y: 0,
                    width: 3,
                    height: 3,
                    left: 0,
                    top: 0,
                  },
                  center: [50, 50] as [number, number],
                  content: '',
                },
                children: [
                  {
                    node: {
                      attributes: {
                        nodeType: NodeType.IMG,
                        style: 'width: 100px; height: 100px;',
                        src: 'https://example.com/image.jpg',
                        htmlTagName: '<img>',
                        ariaLabel: 'image description',
                        storyContent:
                          'Legend had it that the Whispering Woods held an ancient secret, one that connected the world of man and magic, of reality and dream. Each leaf, every rustling branch, was said to carry the whispers of the ancient spirits who protected the forest. Elara often spent her evenings perched on the boundary stones, listening intently to the murmur of the leaves, wondering what secrets they concealed.',
                      },
                      id: '3222',
                      indexId: 20,
                      rect: {
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                        left: 0,
                        top: 0,
                      },
                      center: [50, 50] as [number, number],
                      content: 'world 2345',
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('should be able to describe tree', async () => {
    const description = await descriptionOfTree(tree);
    console.log(description);
    expect(description).toMatchSnapshot();
  });

  it('should be able to describe tree, filterNonTextContent = true', async () => {
    const description = await descriptionOfTree(tree, 20, true);
    console.log(description);
    expect(description).toMatchSnapshot();
  });
});
