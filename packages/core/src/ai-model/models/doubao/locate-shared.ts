import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import type { DoubaoFunctionDefinition } from './action-space';
import { serializeDoubaoToolCall } from './tool-call-serializer';

export const buildClickFunctionDefinition = ({
  includeRole = false,
}: {
  includeRole?: boolean;
} = {}): DoubaoFunctionDefinition => ({
  type: 'function',
  name: 'click',
  parameters: {
    type: 'object',
    properties: {
      ...(includeRole
        ? {
            role: {
              type: 'string',
              enum: ['target', 'reference'],
              description:
                'Whether the point identifies the target or a reference element.',
            },
          }
        : {}),
      point: {
        type: 'string',
        description: 'Click coordinates. The format is: <point>x y</point>',
      },
    },
    required: includeRole ? ['role', 'point'] : ['point'],
  },
});

export const buildClickToolCallExample = ({
  point,
  role,
}: {
  point: string;
  role?: 'target' | 'reference';
}) =>
  serializeDoubaoToolCall({
    functionName: 'click',
    parameters: [
      ...(role
        ? [
            {
              name: 'role',
              stringAttribute: 'true' as const,
              content: role,
            },
          ]
        : []),
      {
        name: 'point',
        stringAttribute: 'true' as const,
        content: `<point>${point}</point>`,
      },
    ],
  });

export const assertPointLocatePromptSpec = (
  locatePromptSpec: LocateResultPromptSpec,
) => {
  if (locatePromptSpec.resultKey !== 'point') {
    throw new Error('Doubao locate protocol requires a point result adapter');
  }
};
