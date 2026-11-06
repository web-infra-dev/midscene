import { z } from 'zod';

export const COMPUTER_BRIDGE_PROTOCOL_VERSION = 1;
const coordinate = z.number().finite();
const point = z.object({ x: coordinate, y: coordinate }).strict();
const target = z.object({ center: z.tuple([coordinate, coordinate]) });
const duration = z.number().finite().min(0).max(60_000);
const textOptions = z
  .object({
    target: target.optional(),
    replace: z.boolean().optional(),
    focusOnly: z.boolean().optional(),
    autoDismissKeyboard: z.boolean().optional(),
    keyboardDismissStrategy: z.enum(['esc-first', 'back-first']).optional(),
    skipDefaultWait: z.boolean().optional(),
    keyboardTypeDelay: duration.optional(),
    inputStrategy: z.enum(['legacy', 'sequential', 'bulk']).optional(),
  })
  .strict();

export const bridgeDeviceOptionsSchema = z
  .object({
    displayId: z.string().min(1).max(256).optional(),
    keyboardDriver: z.enum(['applescript', 'libnut']).optional(),
    keyboardLayout: z.literal('en-US').optional(),
    keyboardModifierDelay: duration.optional(),
    keyboardTypeDelay: duration.optional(),
    inputStrategy: z.enum(['legacy', 'sequential', 'bulk']).optional(),
  })
  .strict();

export const bridgeInputSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('tap'), point, duration: duration.optional() })
    .strict(),
  z.object({ action: z.literal('doubleClick'), point }).strict(),
  z.object({ action: z.literal('rightClick'), point }).strict(),
  z.object({ action: z.literal('hover'), point }).strict(),
  z
    .object({ action: z.literal('dragAndDrop'), from: point, to: point })
    .strict(),
  z
    .object({
      action: z.literal('swipe'),
      from: point,
      to: point,
      options: z
        .object({
          duration: duration.optional(),
          repeat: z.number().int().min(1).max(100).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('typeText'),
      text: z.string().max(262_144),
      options: textOptions.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('keyboardPress'),
      key: z.string().min(1).max(256),
      target: target.optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('clearInput'), target: target.optional() })
    .strict(),
  z
    .object({
      action: z.literal('scroll'),
      param: z
        .object({
          direction: z.enum(['up', 'down', 'left', 'right']).optional(),
          distance: z.number().finite().positive().nullable().optional(),
          scrollType: z
            .enum([
              'singleAction',
              'scrollToBottom',
              'scrollToTop',
              'scrollToRight',
              'scrollToLeft',
            ])
            .optional(),
          locate: target.optional(),
        })
        .strict(),
    })
    .strict(),
]);

const request = <M extends string, S extends z.ZodTypeAny>(
  method: M,
  params: S,
) =>
  z
    .object({
      version: z.literal(COMPUTER_BRIDGE_PROTOCOL_VERSION),
      id: z.string().regex(/^[1-9]\d{0,14}$/),
      method: z.literal(method),
      params,
    })
    .strict();

export const bridgeRequestSchema = z.discriminatedUnion('method', [
  request(
    'hello',
    z
      .object({
        token: z.string().min(1).max(4096),
        options: bridgeDeviceOptionsSchema,
      })
      .strict(),
  ),
  request('screenshot', z.object({}).strict()),
  request('size', z.object({}).strict()),
  request('input', bridgeInputSchema),
  request('disconnect', z.object({}).strict()),
]);

export const bridgeSizeSchema = z.object({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  dpr: z.number().finite().positive().optional(),
});
export const bridgeConnectionInfoSchema = z
  .object({
    protocolVersion: z.literal(COMPUTER_BRIDGE_PROTOCOL_VERSION),
    sessionId: z.string().min(1),
    targetId: z.string().min(1),
    targetOS: z.enum(['windows', 'macos', 'linux']),
    displayId: z.string().optional(),
    size: bridgeSizeSchema,
  })
  .strict();
export const bridgeResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      version: z.literal(COMPUTER_BRIDGE_PROTOCOL_VERSION),
      id: z.string(),
      ok: z.literal(true),
      result: z.unknown(),
    })
    .strict(),
  z
    .object({
      version: z.literal(COMPUTER_BRIDGE_PROTOCOL_VERSION),
      id: z.string(),
      ok: z.literal(false),
      error: z.string(),
    })
    .strict(),
]);

export type ComputerBridgeConnectionInfo = z.infer<
  typeof bridgeConnectionInfoSchema
>;
export type BridgeDeviceOptions = z.infer<typeof bridgeDeviceOptionsSchema>;
export type BridgeInput = z.infer<typeof bridgeInputSchema>;
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
