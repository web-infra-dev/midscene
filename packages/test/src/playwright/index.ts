import { NodeDefinitionError } from '../errors';
import type { NodeDefinition } from '../node/types';
import { createClearCookiesNode } from './clear-cookies';
import { createSetCookiesNode } from './cookies';
import { createGotoUrlNode } from './goto-url';
import type { CreatePlaywrightNodesOptions } from './types';
import { createSetViewportSizeNode } from './viewport';

export { clearCookiesInputSchema } from './clear-cookies';
export type { ClearCookiesNodeInput } from './clear-cookies';
export { setCookiesInputSchema } from './cookies';
export type {
  SetCookiesNodeInput,
  SetCookiesNodeResult,
} from './cookies';
export { gotoUrlInputSchema } from './goto-url';
export type { GotoUrlNodeInput, GotoUrlNodeResult } from './goto-url';
export type {
  CreatePlaywrightNodesOptions,
  PlaywrightCookieProfileContext,
} from './types';
export { setViewportSizeInputSchema } from './viewport';
export type { SetViewportSizeNodeInput } from './viewport';

const requireOptions = <TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
) => {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createPlaywrightNodes() options must be an object.',
    );
  }
  if (typeof options.getPage !== 'function') {
    throw new NodeDefinitionError(
      'createPlaywrightNodes() requires getPage().',
    );
  }
};

/**
 * Create the P0 Playwright preset Nodes without assuming Project Context field
 * names. Cookie values must be resolved through configured references and are
 * never accepted as inline Node input.
 */
export function createPlaywrightNodes<TContext>(
  options: CreatePlaywrightNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  requireOptions(options);
  return [
    createGotoUrlNode(options),
    createSetCookiesNode(options),
    createClearCookiesNode(options),
    createSetViewportSizeNode(options),
  ];
}
