/**
 * rstest 0.9.9 doesn't `export` its internal `TestAPIs` / `TestContext` /
 * `FixtureOptions` types — they're `declare`d only. That makes the type of
 * `baseTest.extend<Fixtures>(...)` unnameable from outside the module, which
 * crashes `tsc --declaration` with TS4023 the moment we try to re-export it.
 *
 * The interfaces below mirror the public surface users actually touch
 * (call signature + variants + `extend` chain + `each` / `for`), built only
 * from public types so the emitted `.d.ts` doesn't reference any unexported
 * rstest internals.
 *
 * If a future rstest release exports these types directly, delete this file
 * and use them straight from `@rstest/core`.
 */

import type { Expect } from '@rstest/core';

type MaybePromise<T> = T | Promise<T>;

export interface TestTaskInfo {
  id: string;
  name: string;
  result?: {
    status: 'pass' | 'fail' | 'skip' | 'todo';
    errors?: Array<{ message?: string }>;
  };
}

export interface BaseTestContext {
  task: TestTaskInfo;
  expect: Expect;
  onTestFinished: (fn: (ctx: BaseTestContext) => MaybePromise<void>) => void;
  onTestFailed: (fn: (ctx: BaseTestContext) => MaybePromise<void>) => void;
}

export type TestCallback<Extra> = (
  ctx: BaseTestContext & Extra,
) => MaybePromise<void>;

export type FixtureFn<Value, Extra> = (
  ctx: BaseTestContext & Extra,
  use: (value: Value) => Promise<void>,
) => Promise<void>;

export type FixtureDecl<Value, Extra> =
  | Value
  | FixtureFn<Value, Extra>
  | [FixtureFn<Value, Extra>, { auto?: boolean }];

export type FixturesDecl<T, Extra> = {
  [K in keyof T]: FixtureDecl<T[K], Extra & Omit<T, K>>;
};

export interface TestApi<Extra = object> {
  (description: string, fn?: TestCallback<Extra>, timeout?: number): void;

  skip: TestApi<Extra>;
  only: TestApi<Extra>;
  todo: TestApi<Extra>;
  fails: TestApi<Extra>;
  concurrent: TestApi<Extra>;
  sequential: TestApi<Extra>;
  runIf: (condition: boolean) => TestApi<Extra>;
  skipIf: (condition: boolean) => TestApi<Extra>;

  extend<T extends Record<string, unknown>>(
    fixtures: FixturesDecl<T, Extra>,
  ): TestApi<Extra & T>;

  each: <T>(
    cases: readonly T[],
  ) => (
    description: string,
    fn?: (param: T, ctx: BaseTestContext & Extra) => MaybePromise<void>,
    timeout?: number,
  ) => void;

  for: <T>(
    cases: readonly T[],
  ) => (
    description: string,
    fn?: (param: T, ctx: BaseTestContext & Extra) => MaybePromise<void>,
    timeout?: number,
  ) => void;
}
