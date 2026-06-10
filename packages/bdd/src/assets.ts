/**
 * Feature asset scanning for @midscene/bdd: parse `.feature` sources into
 * Gherkin documents/pickles and extract `@flow` scenarios into FlowDefs.
 */
import { readFile } from 'node:fs/promises';
import {
  AstBuilder,
  GherkinClassicTokenMatcher,
  Parser,
  compile,
} from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type { GherkinDocument, Pickle } from '@cucumber/messages';
import { glob } from 'glob';
import { FlowRegistry } from './flows';
import { ERROR_PREFIX, IDENT_RE_SOURCE } from './types';
import type { FlowDef, ResolvedBddConfig, ScannedAssets } from './types';

const PARAM_TAG_RE = new RegExp(`^@param:(${IDENT_RE_SOURCE})$`);
const RETURNS_TAG_RE = new RegExp(`^@returns?:(${IDENT_RE_SOURCE})$`);

/** Parse one feature source into its Gherkin document and compiled pickles. */
export function parseFeature(
  source: string,
  uri: string,
): { document: GherkinDocument; pickles: Pickle[] } {
  const newId = IdGenerator.uuid();
  const parser = new Parser(
    new AstBuilder(newId),
    new GherkinClassicTokenMatcher(),
  );

  let document: GherkinDocument;
  try {
    document = parser.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${ERROR_PREFIX} Failed to parse ${uri}: ${message}`);
  }

  document.uri = uri;
  const pickles = [...compile(document, uri, newId)];
  return { document, pickles };
}

/**
 * Extract `@flow`-tagged pickles into FlowDefs. `@param:x` tags bind
 * expression captures positionally (tag order preserved); `@returns:x` (or
 * `@return:x`) tags name values copied back to the caller scope. Duplicate
 * flow names (exact string match) are an error.
 */
export function extractFlowDefs(
  parsed: Array<{ document: GherkinDocument; pickles: Pickle[]; uri: string }>,
): FlowDef[] {
  const defs: FlowDef[] = [];
  const definedIn = new Map<string, string>();

  for (const { document, pickles, uri } of parsed) {
    for (const pickle of pickles) {
      const tags = pickle.tags ?? [];
      if (!tags.some((tag) => tag.name === '@flow')) {
        continue;
      }

      const params: string[] = [];
      const returns: string[] = [];
      for (const tag of tags) {
        const paramMatch = PARAM_TAG_RE.exec(tag.name);
        if (paramMatch) {
          params.push(paramMatch[1]);
        }
        const returnsMatch = RETURNS_TAG_RE.exec(tag.name);
        if (returnsMatch) {
          returns.push(returnsMatch[1]);
        }
      }

      const name = pickle.name;
      const firstUri = definedIn.get(name);
      if (firstUri !== undefined) {
        throw new Error(
          `${ERROR_PREFIX} Duplicate flow "${name}" defined in ${firstUri} and ${uri}`,
        );
      }
      definedIn.set(name, uri);

      defs.push({ name, params, returns, pickle, document, uri });
    }
  }

  return defs;
}

/**
 * Glob and parse all feature files for a resolved config, returning the flow
 * registry and the (sorted, absolute) list of scanned files.
 */
export async function scanAssets(
  config: ResolvedBddConfig,
): Promise<ScannedAssets> {
  const files = (
    await glob(config.paths.features, {
      cwd: config.baseDir,
      absolute: true,
    })
  ).sort();

  const parsed = await Promise.all(
    files.map(async (file) => {
      const { document, pickles } = parseFeature(
        await readFile(file, 'utf-8'),
        file,
      );
      return { document, pickles, uri: file };
    }),
  );

  const defs = extractFlowDefs(parsed);
  return { flows: new FlowRegistry(defs), files };
}
