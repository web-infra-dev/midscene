import { describe, expect, it } from 'vitest';
import { NodeType } from '../../src/constants';
import { descriptionOfTree } from '../../src/extractor/tree';

describe('utils', () => {
  const tree = {
    node: {
      attributes: {
        nodeType: NodeType.CONTAINER,
      },
      id: '1',
      indexId: 19,
      isVisible: true,
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
          isVisible: true,
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
          isVisible: true,
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
              isVisible: true,
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
              isVisible: true,
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
              attributes: {
                nodeType: NodeType.CONTAINER,
              },
              id: '3',
              indexId: 20,
              isVisible: true,
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
                  },
                  id: '3',
                  indexId: 20,
                  isVisible: true,
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
                      isVisible: true,
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
              {
                node: {
                  attributes: {
                    nodeType: NodeType.IMG,
                  },
                  id: '3',
                  indexId: 20,
                  isVisible: false,
                  rect: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100,
                    left: 0,
                    top: 0,
                  },
                  center: [50, 50] as [number, number],
                  content: 'I am invisible',
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
                      isVisible: true,
                      rect: {
                        x: 0,
                        y: 0,
                        width: 100,
                        height: 100,
                        left: 0,
                        top: 0,
                      },
                      center: [50, 50] as [number, number],
                      content: 'I am visible',
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
    const description = descriptionOfTree(tree);
    expect(description).toMatchSnapshot();
  });

  it('should be able to describe tree, filterNonTextContent = true', async () => {
    const description = descriptionOfTree(tree, 20, true);
    expect(description).toMatchSnapshot();
  });

  it('should be able to describe tree, visibleOnly = true', async () => {
    const description = descriptionOfTree(tree, undefined, false, true);
    expect(description).not.toContain('I am invisible');
    expect(description).toContain('I am visible');
    expect(description).toMatchSnapshot();
  });

  it('should be able to describe tree, visibleOnly = false', async () => {
    const description = descriptionOfTree(tree, undefined, false, false);
    expect(description).toContain('I am invisible');
    expect(description).toContain('I am visible');
    expect(description).toMatchSnapshot();
  });
});
