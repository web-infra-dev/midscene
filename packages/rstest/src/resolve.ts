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
// The object form is deep-merged over the defaults, so it accepts a deep
// partial; only the function form must return a complete value.
type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type Resolver<T> =
  | DeepPartial<T>
  | ((config: T) => T | Promise<T>)
  | ReadonlyArray<DeepPartial<T> | ((config: T) => T | Promise<T>)>;

export function applyResolver<T>(
  // `NoInfer` pins `T` to the `base` argument — otherwise TS may infer `T`
  // from the input's union arms and reject valid calls.
  input: Resolver<NoInfer<T>> | undefined,
  base: T,
): Promise<T> {
  return reduceConfigsAsyncWithContext({
    initial: base,
    config: input as ConfigChainAsyncWithContext<T, undefined>,
    mergeFn: deepmerge as unknown as typeof Object.assign,
  });
}
