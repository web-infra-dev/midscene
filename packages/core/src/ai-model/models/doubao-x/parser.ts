import { assert } from '@midscene/shared/utils';
import type { DoubaoXFunctionDefinition, DoubaoXParsedAction } from './actions';

const functionPattern = /<function\s+name="([^"]+)">([\s\S]*?)<\/function>/g;
const parameterPattern =
  /<parameter\s+name="([^"]+)"\s+string="(true|false)">([\s\S]*?)<\/parameter>/g;

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
  const definitionsByName = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );

  for (const functionMatch of content.matchAll(functionPattern)) {
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

  if (content.includes('<seed:tool_call')) {
    assert(
      parsed.length > 0,
      'Doubao-X response contains a tool call block but no valid function call',
    );
  }

  return parsed;
}
