import { assert } from '@midscene/shared/utils';
import type { DoubaoXFunctionDefinition, DoubaoXParsedAction } from './actions';

const functionPattern = /<function\s+name="([^"]+)">([\s\S]*?)<\/function>/g;
const parameterPattern =
  /<parameter\s+name="([^"]+)"\s+string="(true|false)">([\s\S]*?)<\/parameter>/g;

function recoverMalformedPointParameter(content: string): string {
  // Some Ark CUA responses omit the opening <point> tag but still emit its
  // closing tag, e.g. `<parameter name="point" string="true">199 92</point>`.
  // This is the same narrow fallback accepted by the official grounding demo.
  // Do not touch the valid nested `<point>199 92</point></parameter>` form.
  return content.replace(
    /(<parameter\s+name="point"\s+string="(?:true|false)">)([^<]*?)<\/point>/g,
    '$1$2</parameter>',
  );
}

function parseParameterValue(
  value: string,
  isString: boolean,
): string | number {
  if (isString) return value;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

export function parseDoubaoXPlanningResponse(
  content: string,
  definitions: DoubaoXFunctionDefinition[],
): DoubaoXParsedAction[] {
  const parsed: DoubaoXParsedAction[] = [];
  const recoveredContent = recoverMalformedPointParameter(content);
  const definitionsByName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );

  for (const functionMatch of recoveredContent.matchAll(functionPattern)) {
    const [, name, parameterXml] = functionMatch;
    const definition = definitionsByName.get(
      name as DoubaoXParsedAction['function'],
    );
    assert(definition, `Unsupported Doubao-X action: ${name}`);

    const parameters: Record<string, string | number> = {};
    for (const parameterMatch of parameterXml.matchAll(parameterPattern)) {
      const [, parameterName, stringFlag, value] = parameterMatch;
      assert(
        definition.parameters.properties[parameterName],
        `Unsupported parameter ${parameterName} for Doubao-X action ${name}`,
      );
      parameters[parameterName] = parseParameterValue(
        value,
        stringFlag === 'true',
      );
    }
    for (const required of definition.parameters.required) {
      assert(
        parameters[required] !== undefined,
        `Missing required parameter ${required} for Doubao-X action ${name}`,
      );
    }
    parsed.push({ function: definition.name, parameters });
  }

  if (recoveredContent.includes('<seed:tool_call')) {
    assert(
      parsed.length > 0,
      'Doubao-X response contains a tool call block but no valid function call',
    );
  }

  return parsed;
}
