import { assert } from '@midscene/shared/utils';
import { callSystemOneAI } from '../../service-caller';
import { systemOneResponseSchema } from '../../service-caller/system-one/schema';
import type { BooleanFn } from '../../workflows/insight/boolean';
import { prepareJevImage, prepareReferences } from './image';

export const jevBoolean: BooleanFn = async (options) => {
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
  const result = await callSystemOneAI(
    {
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
    options.modelRuntime,
    { abortSignal: options.abortSignal },
  );
  const answer = systemOneResponseSchema.parse(JSON.parse(result.content))
    .answers.result;
  assert(answer.type === 'noul', 'Invalid Jev boolean answer');
  return {
    value: answer.noul >= 0.5,
    rawResponse: result.content,
    usage: result.usage,
  };
};
