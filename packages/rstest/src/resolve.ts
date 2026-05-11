import deepmerge from 'deepmerge';
import {
  type ConfigChainAsyncWithContext,
  reduceConfigsAsyncWithContext,
} from 'reduce-configs';

/**
 * An options "resolver". Accepts:
 * - an object — deep-merged over the resolved defaults; arrays concatenate,
 * - a function `(defaults) => value` (sync or async) that takes full control, or
 * - an array of either, applied left-to-right.
 *
 * Deep-merge keeps sibling fields: passing `{ viewport: { width: 1440 } }` over
 * a base of `{ viewport: { width: 1920, height: 1080 } }` produces
 * `{ viewport: { width: 1440, height: 1080 } }`. Arrays concatenate, so
 * `{ args: ['--start-fullscreen'] }` appends to the package's default browser
 * args rather than replacing them. To fully replace, use the function form:
 * `(defaults) => ({ ...defaults, args: ['--only-this'] })`.
 */
// Inlined from reduce-configs so the generated .d.ts doesn't reference a
// devDependency. `reduce-configs` is bundled by rslib at build time but isn't
// shipped as a runtime dep, so consumers must not see it in our type surface.
// The runtime supports `void`-returning mutate-in-place functions too, but
// they're an antipattern — we only advertise the return-new-value form.
export type Resolver<T> =
  | T
  | ((config: T) => T | Promise<T>)
  | ReadonlyArray<T | ((config: T) => T | Promise<T>)>;

export function applyResolver<T>(
  input: Resolver<T> | undefined,
  base: T,
): Promise<T> {
  return reduceConfigsAsyncWithContext({
    initial: base,
    config: input as ConfigChainAsyncWithContext<T, undefined>,
    mergeFn: deepmerge as unknown as typeof Object.assign,
  });
}
