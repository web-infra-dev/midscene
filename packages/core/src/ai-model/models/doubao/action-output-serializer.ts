import type { PlanningActionOutputBuildInput } from '../../model-adapter/planning-protocol';
import { SEED_TOOL_CALL_TAG_NAME } from './constants';
import { escapeXmlAttribute, escapeXmlText } from './xml';

const serializeParameterValue = (value: unknown) => {
  if (typeof value === 'string') {
    return {
      stringAttribute: 'true',
      content: escapeXmlText(value),
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return {
      stringAttribute: 'false',
      content: String(value),
    };
  }

  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error('Failed to serialize Seed parameter value as JSON');
  }

  return {
    stringAttribute: 'false',
    content: escapeXmlText(json),
  };
};

const serializeLocateParameter = (
  value: unknown,
  locateResultKey: string | undefined,
) => {
  // This serializes samples defined by the actionSpace, whose locator prompt
  // is a plain string. Unlike runtime aiTap or YAML input, it does not handle
  // the multimodal TUserPrompt shape nested under `prompt`.
  if (
    !value ||
    typeof value !== 'object' ||
    !('prompt' in value) ||
    typeof value.prompt !== 'string'
  ) {
    throw new Error(
      'Failed to serialize Seed locator parameter: missing prompt',
    );
  }

  const promptTag = `<prompt>${escapeXmlText(value.prompt)}</prompt>`;
  if (!locateResultKey) {
    return promptTag;
  }

  const locateResult = (value as Record<string, unknown>)[locateResultKey];
  if (
    locateResultKey !== 'point' ||
    !Array.isArray(locateResult) ||
    locateResult.length !== 2 ||
    !locateResult.every((coordinate) => typeof coordinate === 'number')
  ) {
    throw new Error(
      'Seed planning locator output requires point: [number, number]',
    );
  }

  return `${promptTag}<point>${locateResult[0]} ${locateResult[1]}</point>`;
};

export const buildDoubaoPlanningActionOutput = ({
  actionName,
  param,
  locateFields = [],
  locateResultKey,
}: PlanningActionOutputBuildInput) => {
  const locateFieldSet = new Set(locateFields);
  const parameters = Object.entries(param)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => {
      const serializedValue = locateFieldSet.has(name)
        ? {
            stringAttribute: 'true',
            content: serializeLocateParameter(value, locateResultKey),
          }
        : serializeParameterValue(value);

      return `<parameter name="${escapeXmlAttribute(name)}" string="${serializedValue.stringAttribute}">${serializedValue.content}</parameter>`;
    })
    .join('');

  return `<${SEED_TOOL_CALL_TAG_NAME}><function name="${escapeXmlAttribute(actionName)}">${parameters}</function></${SEED_TOOL_CALL_TAG_NAME}>`;
};
