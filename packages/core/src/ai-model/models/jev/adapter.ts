import { userPromptToString } from '@/common';
import type { TModelFamily } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import type { ModelAdapterDefinition } from '../../model-adapter/types';
import { callAI } from '../../service-caller';
import { systemOneResponseSchema } from '../../service-caller/system-one';
import { prepareUserPrompt } from '../../shared/multimodal-prompt';
import type { LocateFn } from '../../workflows/grounding/types';
import type { BooleanFn } from '../../workflows/insight/boolean';
import { mapJevBox, prepareJevImage } from './image';
import { jevPlan } from './planning';

async function prepareReferences(
  prompt: Parameters<typeof prepareUserPrompt>[0],
) {
  const { referenceImages } = await prepareUserPrompt(prompt);
  const prepared = await Promise.all(
    referenceImages.map(async (image, index) => ({
      key: `reference_${index}`,
      name: image.name,
      image: await prepareJevImage(image.url),
    })),
  );
  return {
    references: prepared.map(({ key, name }) => ({
      image: `\`${key}\``,
      name,
    })),
    images: Object.fromEntries(
      prepared.map(({ key, image }) => [key, image.imageBase64]),
    ),
  };
}

const locate: LocateFn = async ({
  targetElementDescription,
  locateImage,
  options,
}) => {
  const image = await prepareJevImage(locateImage.imageBase64);
  const references = await prepareReferences(targetElementDescription);
  const target = userPromptToString(targetElementDescription);
  const response = await callAI([], options.modelRuntime, {
    abortSignal: options.abortSignal,
    systemOneRequest: {
      state: { target, references: references.references },
      images: { screenshot: image.imageBase64, ...references.images },
      questions: {
        present: {
          type: 'noul',
          instructions:
            'Is the target described in `target` present in `screenshot`? Reference images, if any, describe the target; they are not the screenshot.',
        },
        target: {
          type: 'box',
          instructions:
            'The single target described in `target`, in `screenshot`.',
        },
      },
    },
  });
  const { answers } = systemOneResponseSchema.parse(
    JSON.parse(response.content),
  );
  assert(
    answers.present.type === 'noul' && answers.target.type === 'box',
    'Invalid Jev locate answers',
  );
  return {
    rawResponse: response.content,
    usage: response.usage,
    ...(answers.present.noul >= 0.5
      ? {
          locatedPixelResult: mapJevBox(answers.target.box, image, locateImage),
        }
      : { errors: ['The target is not present in the screenshot'] }),
  };
};

const boolean: BooleanFn = async (options) => {
  const references = await prepareReferences({
    prompt: '',
    ...options.multimodalPrompt,
  });
  const frames =
    options.extractOption?.screenshotIncluded === false
      ? []
      : options.context.screenshotSequence?.length
        ? options.context.screenshotSequence
        : [options.context.screenshot];
  const screenshots = await Promise.all(
    frames.map((frame) => prepareJevImage(frame.base64)),
  );
  const result = await callAI([], options.modelRuntime, {
    abortSignal: options.abortSignal,
    systemOneRequest: {
      state: {
        statement: options.dataQuery,
        context: options.extractOption?.context,
        pageDescription: options.pageDescription,
        frames: screenshots.map((_, index) => `\`frame_${index}\``),
        references: references.references,
      },
      images: {
        ...Object.fromEntries(
          screenshots.map((image, index) => [
            `frame_${index}`,
            image.imageBase64,
          ]),
        ),
        ...references.images,
      },
      questions: {
        result: {
          type: 'noul',
          instructions:
            'Is `statement` true? Screenshots in `frames` are ordered earliest to latest. For current state use the latest frame; for events use the relevant frames. Reference images are supporting context, not screenshots, unless the statement requests comparison. Use the provided context and page description when present.',
        },
      },
    },
  });
  const answer = systemOneResponseSchema.parse(JSON.parse(result.content))
    .answers.result;
  assert(answer.type === 'noul', 'Invalid Jev boolean answer');
  return {
    value: answer.noul >= 0.5,
    rawResponse: result.content,
    usage: result.usage,
  };
};

export const jevAdapters = {
  jev: {
    supportedTasks: ['locate', 'boolean', 'planning'],
    supportedProtocols: [],
    locate: { kind: 'custom', locateFn: locate },
    insight: { booleanFn: boolean },
    planning: {
      kind: 'custom',
      planFn: jevPlan,
      cacheEnabled: false,
      supportsActionDeepLocate: false,
      defaultReplanningCycleLimit: 20,
    },
  },
} satisfies Pick<Record<TModelFamily, ModelAdapterDefinition>, 'jev'>;
