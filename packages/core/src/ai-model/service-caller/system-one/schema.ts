import { z } from 'zod';

export interface SystemOneRequest {
  state: Record<string, unknown>;
  images?: Record<string, string>;
  questions: Record<
    string,
    | { type: 'noul' | 'box'; instructions: unknown }
    | {
        type: 'choice';
        instructions: unknown;
        criteria: Record<string, string>;
      }
  >;
}

const probability = z.number().min(0).max(1);
export const systemOneAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: probability }),
  z.object({ type: z.literal('choice'), choice: z.string() }),
  z.object({
    type: z.literal('box'),
    box: z
      .object({
        left: probability,
        right: probability,
        top: probability,
        bottom: probability,
      })
      .refine(
        (box) => box.left < box.right && box.top < box.bottom,
        'Invalid box edges',
      ),
  }),
]);
export const systemOneResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(systemOneAnswerSchema),
  usage: z
    .object({
      input_tokens: z.number().nonnegative().nullable().optional(),
      output_tokens: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});
