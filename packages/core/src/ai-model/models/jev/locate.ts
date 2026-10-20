import { userPromptToString } from '@/common';
import { assert } from '@midscene/shared/utils';
import { callSystemOneAI } from '../../service-caller';
import { systemOneResponseSchema } from '../../service-caller/system-one/schema';
import type { LocateFn } from '../../workflows/grounding/types';
import { mapJevBox, prepareJevImage, prepareReferences } from './image';

export const jevLocate: LocateFn = async ({
  targetElementDescription,
  locateImage,
  options,
}) => {
  const image = await prepareJevImage(locateImage.imageBase64);
  const references = await prepareReferences(targetElementDescription);
  const target = userPromptToString(targetElementDescription);
  const response = await callSystemOneAI(
    {
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
    options.modelRuntime,
    { abortSignal: options.abortSignal },
  );
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
          locatedPixelResult: mapJevBox(answers.target.box, locateImage),
        }
      : {
          outcome: 'not-found' as const,
          errors: ['The target is not present in the screenshot'],
        }),
  };
};
