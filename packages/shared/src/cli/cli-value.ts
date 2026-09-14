import { z } from 'zod';
import { unwrapZodField } from '../zod-schema-utils';

const cliNumberPattern = /^-?\d+(\.\d+)?$/;

function parseJsonValue(raw: string): unknown {
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // Preserve text for string inputs or the later schema validation error.
    return raw;
  }
}

export function parseValue(raw: string): unknown {
  const parsed = parseJsonValue(raw);
  if (parsed !== raw) return parsed;
  return cliNumberPattern.test(raw) ? Number(raw) : raw;
}

// Keep the actual alternatives: a string literal is not an arbitrary string,
// and a repeated tuple argument must retain its position-specific schema.
function getInputFields(field: z.ZodTypeAny): z.ZodTypeAny[] {
  const input = unwrapZodField(field) as z.ZodTypeAny;
  if (input instanceof z.ZodUnion) {
    return input.options.flatMap(getInputFields);
  }
  return [input];
}

function getRepeatedInputFields(
  fields: z.ZodTypeAny[],
  index: number,
): z.ZodTypeAny[] {
  const collections = fields.filter(
    (field): field is z.ZodArray<z.ZodTypeAny> | z.AnyZodTuple =>
      field instanceof z.ZodArray || field instanceof z.ZodTuple,
  );
  if (collections.length === 0) return fields;
  return collections.flatMap((field) => {
    const item =
      field instanceof z.ZodArray
        ? field.element
        : (field.items[index] ?? field._def.rest);
    return item ? getInputFields(item) : [];
  });
}

// Only inspect scalar constraints here. Effects have been unwrapped, and
// collection children are left to the existing full validation step.
function acceptsValue(
  field: z.ZodTypeAny,
  value: unknown,
): boolean | undefined {
  if (field instanceof z.ZodString) {
    return typeof value === 'string' && field.safeParse(value).success;
  }
  if (field instanceof z.ZodNumber) {
    return typeof value === 'number' && field.safeParse(value).success;
  }
  if (field instanceof z.ZodBoolean) return typeof value === 'boolean';
  if (
    field instanceof z.ZodEnum ||
    field instanceof z.ZodNativeEnum ||
    field instanceof z.ZodLiteral
  ) {
    return field.safeParse(value).success;
  }
  if (field instanceof z.ZodArray || field instanceof z.ZodTuple) {
    return Array.isArray(value);
  }
  if (
    field instanceof z.ZodObject ||
    field instanceof z.ZodRecord ||
    field instanceof z.ZodDiscriminatedUnion
  ) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  return undefined;
}

/** Decode one CLI token; index is supplied only for repeated options. */
export function parseCliValue(
  raw: string,
  field?: z.ZodTypeAny,
  index?: number,
): unknown {
  if (!field) return parseValue(raw);
  const json = parseJsonValue(raw);
  const wholeFields = getInputFields(field);
  if (json !== raw && wholeFields.some((input) => acceptsValue(input, json))) {
    return json;
  }

  const fields =
    index === undefined
      ? wholeFields
      : getRepeatedInputFields(wholeFields, index);
  const candidates: unknown[] = json !== raw ? [json, raw] : [raw];
  if (cliNumberPattern.test(raw)) candidates.push(Number(raw));
  if (raw === 'true' || raw === 'false') candidates.push(raw === 'true');
  for (const candidate of candidates) {
    if (fields.some((input) => acceptsValue(input, candidate)))
      return candidate;
  }
  return fields.some((input) => acceptsValue(input, raw) === undefined)
    ? parseValue(raw)
    : raw;
}
