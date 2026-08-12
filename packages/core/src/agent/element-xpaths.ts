import { readFile } from 'node:fs/promises';
import { findAllMidsceneLocatorField } from '@/ai-model';
import type { DeviceAction, PlanningAction } from '@/types';
import yaml from 'js-yaml';

interface ElementXpathFile {
  elements: Record<string, string>;
}

export interface LoadedElementXpath {
  name: string;
  xpath: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizedElementName = (name: string) =>
  name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/["“”「」『』]/g, '')
    .replace(/^(?:the|a|an)\s+/, '')
    .replace(/\s+/g, ' ');

function parseElementXpathFile(
  content: string,
  sourcePath: string,
): ElementXpathFile {
  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new Error(
      `Failed to parse element XPath file "${sourcePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Invalid element XPath file "${sourcePath}": expected a YAML object`,
    );
  }
  if (!isPlainObject(parsed.elements)) {
    throw new Error(
      `Invalid element XPath file "${sourcePath}": "elements" must be a map from element names to XPath strings`,
    );
  }

  const elements: Record<string, string> = {};
  for (const [name, xpath] of Object.entries(parsed.elements)) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error(
        `Invalid element XPath file "${sourcePath}": element names must not be empty`,
      );
    }
    if (typeof xpath !== 'string' || !xpath.trim()) {
      throw new Error(
        `Invalid element XPath file "${sourcePath}": XPath for element "${trimmedName}" must be a non-empty string`,
      );
    }
    elements[trimmedName] = xpath.trim();
  }

  if (Object.keys(elements).length === 0) {
    throw new Error(
      `Invalid element XPath file "${sourcePath}": "elements" must contain at least one entry`,
    );
  }

  return { elements };
}

export async function loadElementXpaths(
  paths: string[],
): Promise<LoadedElementXpath[]> {
  const loaded: LoadedElementXpath[] = [];
  const knownNames = new Map<string, string>();

  for (const sourcePath of paths) {
    let content: string;
    try {
      content = await readFile(sourcePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read element XPath file "${sourcePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    const definition = parseElementXpathFile(content, sourcePath);
    for (const [name, xpath] of Object.entries(definition.elements)) {
      const normalizedName = normalizedElementName(name);
      const existingName = knownNames.get(normalizedName);
      if (existingName) {
        throw new Error(
          `Invalid element XPath file "${sourcePath}": element name "${name}" conflicts with "${existingName}"`,
        );
      }
      knownNames.set(normalizedName, name);
      loaded.push({ name, xpath });
    }
  }

  return loaded;
}

export function elementXpathsPlanningContext(
  elements: LoadedElementXpath[],
): string | undefined {
  if (elements.length === 0) {
    return undefined;
  }

  const elementMap = Object.fromEntries(
    elements.map(({ name, xpath }) => [name, xpath]),
  );
  return [
    'Known UI elements and their exact XPaths are provided below.',
    'When the chosen action requires a locator for one of these elements, use the map key verbatim as the locator prompt. Do not generate coordinates or rewrite the element name. The runtime will resolve that prompt through the known XPath.',
    'Do not add a locator to an action that can operate on the currently focused element. For example, after Tap focuses a mapped input, a following Input should omit its optional locator.',
    'If no entry matches the target, use a normal descriptive locator prompt so Midscene can fall back to AI locating.',
    JSON.stringify(elementMap),
  ].join('\n');
}

function locatorPromptText(locator: unknown): string | undefined {
  if (typeof locator === 'string') {
    return locator;
  }
  if (!isPlainObject(locator)) {
    return undefined;
  }

  const prompt = locator.prompt;
  if (typeof prompt === 'string') {
    return prompt;
  }
  if (isPlainObject(prompt) && typeof prompt.prompt === 'string') {
    return prompt.prompt;
  }
  if (typeof locator.description === 'string') {
    return locator.description;
  }
  return undefined;
}

function locatorAlreadyResolved(locator: unknown): boolean {
  return isPlainObject(locator) && typeof locator.xpath === 'string';
}

function xpathForLocatorPrompt(
  prompt: string,
  elements: LoadedElementXpath[],
): string | undefined {
  const normalizedPrompt = normalizedElementName(prompt);
  const exactMatch = elements.find(
    ({ name }) => normalizedElementName(name) === normalizedPrompt,
  );
  if (exactMatch) {
    return exactMatch.xpath;
  }

  const paddedPrompt = ` ${normalizedPrompt} `;
  const containedMatches = elements
    .map((element) => ({
      ...element,
      normalizedName: normalizedElementName(element.name),
    }))
    .filter(({ normalizedName }) =>
      paddedPrompt.includes(` ${normalizedName} `),
    )
    .sort(
      (left, right) => right.normalizedName.length - left.normalizedName.length,
    );

  if (containedMatches.length === 0) {
    return undefined;
  }
  if (
    containedMatches[1]?.normalizedName.length ===
    containedMatches[0].normalizedName.length
  ) {
    return undefined;
  }
  return containedMatches[0].xpath;
}

function locatorWithXpath(locator: unknown, prompt: string, xpath: string) {
  if (typeof locator === 'string') {
    return { prompt: locator, xpath };
  }

  const {
    bbox: _bbox,
    center: _center,
    description: _description,
    locatedPixelBbox: _locatedPixelBbox,
    rect: _rect,
    ...locatorWithoutCoordinates
  } = locator as Record<string, unknown>;

  return {
    ...locatorWithoutCoordinates,
    prompt,
    xpath,
  };
}

export function applyElementXpathsToPlans(
  plans: PlanningAction[],
  elements: LoadedElementXpath[],
  actionSpace: DeviceAction[],
): { plans: PlanningAction[]; mapped: boolean } {
  if (elements.length === 0) {
    return { plans, mapped: false };
  }

  let mapped = false;

  const transformedPlans = plans.map((plan) => {
    const action = actionSpace.find(
      (candidate) => candidate.name === plan.type,
    );
    if (!action || !isPlainObject(plan.param)) {
      return plan;
    }

    const locateFields = findAllMidsceneLocatorField(action.paramSchema);
    let transformedParam: Record<string, unknown> | undefined;

    for (const field of locateFields) {
      const locator = plan.param[field];
      if (!locator || locatorAlreadyResolved(locator)) {
        continue;
      }
      const prompt = locatorPromptText(locator);
      if (!prompt) {
        continue;
      }
      const xpath = xpathForLocatorPrompt(prompt, elements);
      if (!xpath) {
        continue;
      }

      transformedParam ??= { ...plan.param };
      transformedParam[field] = locatorWithXpath(locator, prompt, xpath);
      mapped = true;
    }

    return transformedParam ? { ...plan, param: transformedParam } : plan;
  });

  return { plans: transformedPlans, mapped };
}
