/**
 * An options "resolver". Pass an object to shallow-merge over the resolved
 * defaults, or a function to receive the defaults and return a fully-controlled
 * value (sync or async).
 */
export type Resolver<T> = T | ((defaults: T) => T | Promise<T>);

export async function applyResolver<T>(
  input: Resolver<T> | undefined,
  base: T,
): Promise<T> {
  if (input === undefined) return base;
  if (typeof input === 'function') {
    return await (input as (defaults: T) => T | Promise<T>)(base);
  }
  return { ...base, ...input };
}
