import { z } from 'zod';

/** Zod schema for a Web XPath locator target. */
export const XPathLocatorTargetSchema = z
  .object({
    strategy: z.literal('xpath'),
    selector: z.string().trim().min(1),
  })
  .strict();

/**
 * A stable, platform-specific reference that can be resolved to a fresh Rect.
 * Additional strategies can be added as new discriminated-union members.
 */
export const LocatorTargetSchema = z.discriminatedUnion('strategy', [
  XPathLocatorTargetSchema,
]);

export type LocatorTarget = z.infer<typeof LocatorTargetSchema>;

/** Create and validate an XPath locator target. */
export function xpathLocatorTarget(selector: string): LocatorTarget {
  return LocatorTargetSchema.parse({ strategy: 'xpath', selector });
}
