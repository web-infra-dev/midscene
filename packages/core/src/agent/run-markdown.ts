import { dirname, isAbsolute, resolve } from 'node:path';
import type { TUserPrompt } from '@/common';

const MAX_MARKDOWN_IMAGES = 20;
const REFERENCE_IMAGE_PREFIX = '参考图片';

type MdastNode = {
  type: string;
  children?: MdastNode[];
  url?: string;
  identifier?: string;
  label?: string;
};

type MdastRoot = MdastNode & {
  children: MdastNode[];
};

type MdastFromMarkdownModule = {
  fromMarkdown: (value: string) => MdastRoot;
};

type MdastToMarkdownModule = {
  toMarkdown: (tree: MdastRoot) => string;
};

export type RunMarkdownTransformResult = {
  prompt: TUserPrompt;
  imageCount: number;
};

const imageNameForIndex = (index: number) =>
  `${REFERENCE_IMAGE_PREFIX}-${String(index + 1).padStart(3, '0')}`;

const formatSource = (sourcePath?: string) =>
  sourcePath ? ` in ${sourcePath}` : '';

const hasUrlScheme = (url: string) => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url);

const resolveMarkdownImageUrl = (url: string, sourcePath?: string) => {
  if (!sourcePath || hasUrlScheme(url) || isAbsolute(url)) {
    return url;
  }
  return resolve(dirname(sourcePath), url);
};

const replaceMarkdownImages = (tree: MdastRoot, sourcePath?: string) => {
  const images: Array<{ name: string; url: string }> = [];

  const visitChildren = (node: MdastNode) => {
    if (!Array.isArray(node.children)) {
      return;
    }

    node.children = node.children.map((child) => {
      if (child.type === 'imageReference') {
        const identifier = child.identifier || child.label || 'unknown';
        throw new Error(
          `runMarkdown does not support reference-style image "${identifier}"${formatSource(sourcePath)}. Use direct image syntax instead.`,
        );
      }

      if (child.type === 'image') {
        const name = imageNameForIndex(images.length);
        if (!child.url) {
          throw new Error(
            `Markdown image ${name}${formatSource(sourcePath)} is missing a URL.`,
          );
        }

        images.push({
          name,
          url: resolveMarkdownImageUrl(child.url, sourcePath),
        });
        if (images.length > MAX_MARKDOWN_IMAGES) {
          throw new Error(
            `runMarkdown supports at most ${MAX_MARKDOWN_IMAGES} images, but found ${images.length} images${formatSource(sourcePath)}.`,
          );
        }

        return {
          type: 'text',
          value: name,
        } as MdastNode;
      }

      visitChildren(child);
      return child;
    });
  };

  visitChildren(tree);
  return images;
};

export const markdownToAiActPrompt = async (
  markdown: string,
  sourcePath?: string,
): Promise<RunMarkdownTransformResult> => {
  const fromMarkdownModuleName = 'mdast-util-from-markdown';
  const toMarkdownModuleName = 'mdast-util-to-markdown';
  const { fromMarkdown } = (await import(
    fromMarkdownModuleName
  )) as MdastFromMarkdownModule;
  const { toMarkdown } = (await import(
    toMarkdownModuleName
  )) as MdastToMarkdownModule;

  const tree = fromMarkdown(markdown);
  const images = replaceMarkdownImages(tree, sourcePath);

  if (images.length === 0) {
    return {
      prompt: markdown,
      imageCount: 0,
    };
  }

  return {
    prompt: {
      prompt: toMarkdown(tree),
      images,
      convertHttpImage2Base64: true,
    },
    imageCount: images.length,
  };
};
