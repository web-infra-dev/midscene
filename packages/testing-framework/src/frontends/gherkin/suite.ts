/**
 * POC: multi-file Gherkin suites.
 *
 * `compileFeature` returns flows per file, but real suites keep shared flow
 * definitions (login, add-to-cart, …) in their own `.feature` files and call
 * them from separate test modules. `compileSuite` is the assembly step for
 * that layout: compile every file, merge ALL flow definitions into one
 * {@link FlowRegistry} (duplicate flow names across files fail loudly,
 * naming both files), and hand back the compiled modules so the caller can
 * run each module's scenarios against the shared registry.
 */
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FlowRegistry } from '../../flow-ir';
import { createFlowRegistry } from '../../flow-ir';
import { listFiles } from '../../runner/glob';
import { type CompiledFeature, compileFeatureFile } from './index';

/** One compiled `.feature` file of a suite. */
export interface SuiteModule {
  /** Absolute path of the `.feature` file. */
  file: string;
  feature: CompiledFeature;
}

export interface CompiledSuite {
  /** Every compiled `.feature` file, in deterministic (sorted-path) order. */
  modules: SuiteModule[];
  /** All flow definitions from all files, merged into one registry. */
  registry: FlowRegistry;
}

/**
 * Compile a whole suite: a directory (every `.feature` under it, recursively)
 * or an explicit list of `.feature` files. Scenarios from any module may call
 * flows defined in any other module via the shared registry.
 */
export function compileSuite(input: string | string[]): CompiledSuite {
  const files = Array.isArray(input)
    ? input.map((f) => resolve(f))
    : discoverFeatureFiles(input);
  if (files.length === 0) {
    throw new Error(
      `[midscene] compileSuite: no .feature files found in ${JSON.stringify(input)}.`,
    );
  }

  const modules: SuiteModule[] = files.map((file) => ({
    file,
    feature: compileFeatureFile(file),
  }));

  // Merge flows across files. The registry itself rejects duplicates, but a
  // cross-file clash deserves an error that names both definition sites.
  const flowSources = new Map<string, string>();
  const registry = createFlowRegistry();
  for (const { file, feature } of modules) {
    for (const flow of feature.flows) {
      const existing = flowSources.get(flow.name);
      if (existing) {
        throw new Error(
          `[midscene] compileSuite: flow "${flow.name}" is defined in both ${existing} and ${file}. Flow names are suite-global — rename one of them.`,
        );
      }
      flowSources.set(flow.name, file);
      registry.register(flow);
    }
  }

  return { modules, registry };
}

function discoverFeatureFiles(dir: string): string[] {
  const root = resolve(dir);
  if (!statSync(root).isDirectory()) {
    throw new Error(
      `[midscene] compileSuite: ${root} is not a directory. Pass a suite directory or an explicit list of .feature files.`,
    );
  }
  return listFiles(root)
    .filter((rel) => rel.endsWith('.feature'))
    .sort()
    .map((rel) => join(root, rel));
}
