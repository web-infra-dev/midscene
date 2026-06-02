import { pathToFileURL } from 'node:url';

/**
 * The slice of `@rsbuild/core` the helper needs. Loosely typed so
 * `@midscene/shared` does not take a hard dependency on `@rstest/core` /
 * `@rsbuild/core` (both are resolved at runtime by the caller).
 */
export interface RsbuildLike {
  rspack: {
    experiments: {
      VirtualModulesPlugin: new (modules: Record<string, string>) => unknown;
    };
  };
}

export interface RstestRunResultLike {
  ok?: boolean;
  [key: string]: unknown;
}

export interface RunRstestWithVirtualModulesOptions {
  /** Working directory passed to Rstest. */
  cwd: string;
  /** Project root. */
  root: string;
  /** Rstest `include` entries (typically the virtual module ids). */
  include: string[];
  /** Virtual test modules to register with the bundler. */
  virtualModules: Record<string, string>;
  /**
   * Absolute path to the `@rsbuild/core` entry. The caller resolves it from the
   * right base — the user project for `@midscene/testing-framework`, the bundled
   * copy for `@midscene/cli` — so this helper stays free of a hard
   * `@rstest/core` / `@rsbuild/core` dependency.
   */
  rsbuildEntry: string;
  testTimeout?: number;
  maxConcurrency?: number;
  bail?: number;
  reporters?: unknown[];
}

/**
 * Build the Rstest `inlineConfig` that registers `virtualModules` as test files
 * through `@rsbuild/core`'s `VirtualModulesPlugin`. Pure (no I/O) so it can be
 * unit tested directly; {@link runRstestWithVirtualModules} wires it to the real
 * `runRstest`.
 */
export function buildRstestInlineConfig(
  options: RunRstestWithVirtualModulesOptions,
  rsbuild: RsbuildLike,
): Record<string, unknown> {
  const maxConcurrency =
    options.maxConcurrency !== undefined
      ? Math.max(1, options.maxConcurrency)
      : undefined;

  return {
    root: options.root,
    include: options.include,
    testEnvironment: 'node',
    ...(options.testTimeout !== undefined
      ? { testTimeout: options.testTimeout }
      : {}),
    ...(maxConcurrency !== undefined
      ? {
          maxConcurrency,
          pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency },
        }
      : {}),
    ...(options.bail !== undefined ? { bail: options.bail } : {}),
    ...(options.reporters !== undefined
      ? { reporters: options.reporters }
      : {}),
    tools: {
      rspack: (
        _config: unknown,
        { appendPlugins }: { appendPlugins: (plugin: unknown) => void },
      ) => {
        appendPlugins(
          new rsbuild.rspack.experiments.VirtualModulesPlugin(
            options.virtualModules,
          ),
        );
      },
    },
  };
}

/**
 * Run an in-process Rstest pass whose test files are supplied as virtual
 * modules. Shared by `@midscene/cli` and `@midscene/testing-framework`: each
 * resolves `@rstest/core` + `@rsbuild/core` from its own base and passes the
 * resolved `@rsbuild/core` entry path in.
 */
export async function runRstestWithVirtualModules(
  options: RunRstestWithVirtualModulesOptions,
): Promise<RstestRunResultLike> {
  // `@rstest/core` is a dev-only dependency here (types); at runtime it resolves
  // from the caller's context — the CLI's bundled copy or the user project's
  // peer dependency — never from `@midscene/shared` itself.
  const [rstestApi, rsbuild] = await Promise.all([
    import('@rstest/core/api') as unknown as Promise<{
      runRstest: (args: {
        cwd: string;
        inlineConfig: Record<string, unknown>;
      }) => Promise<RstestRunResultLike>;
    }>,
    import(pathToFileURL(options.rsbuildEntry).href) as Promise<RsbuildLike>,
  ]);

  return rstestApi.runRstest({
    cwd: options.cwd,
    inlineConfig: buildRstestInlineConfig(options, rsbuild),
  });
}
