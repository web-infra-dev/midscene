import { z } from 'zod';
import { unwrapZodField } from '../zod-schema-utils';

const cliNumberPattern = /^-?\d+(\.\d+)?$/;

interface CliZodDef {
  typeName?: z.ZodFirstPartyTypeKind;
  options?: z.ZodTypeAny[];
  type?: z.ZodTypeAny;
  items?: z.ZodTypeAny[];
  rest?: z.ZodTypeAny | null;
}

function getFieldDef(field: z.ZodTypeAny): CliZodDef {
  return (field as z.ZodTypeAny & { _def: CliZodDef })._def;
}

function getFieldKind(
  field: z.ZodTypeAny,
): z.ZodFirstPartyTypeKind | undefined {
  return getFieldDef(field).typeName;
}

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
  const inputDef = getFieldDef(input);
  if (inputDef.typeName === z.ZodFirstPartyTypeKind.ZodUnion) {
    return (inputDef.options ?? []).flatMap(getInputFields);
  }
  return [input];
}

function getRepeatedInputFields(
  fields: z.ZodTypeAny[],
  index: number,
): z.ZodTypeAny[] {
  const collections = fields.filter((field) => {
    const kind = getFieldKind(field);
    return (
      kind === z.ZodFirstPartyTypeKind.ZodArray ||
      kind === z.ZodFirstPartyTypeKind.ZodTuple
    );
  });
  if (collections.length === 0) return fields;
  return collections.flatMap((field) => {
    const fieldDef = getFieldDef(field);
    const item =
      fieldDef.typeName === z.ZodFirstPartyTypeKind.ZodArray
        ? fieldDef.type
        : (fieldDef.items?.[index] ?? fieldDef.rest);
    return item ? getInputFields(item) : [];
  });
}

// Only inspect scalar constraints here. Effects have been unwrapped, and
// collection children are left to the existing full validation step.
function acceptsValue(
  field: z.ZodTypeAny,
  value: unknown,
): boolean | undefined {
  switch (getFieldKind(field)) {
    case z.ZodFirstPartyTypeKind.ZodString:
      return typeof value === 'string' && field.safeParse(value).success;
    case z.ZodFirstPartyTypeKind.ZodNumber:
      return typeof value === 'number' && field.safeParse(value).success;
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return typeof value === 'boolean';
    case z.ZodFirstPartyTypeKind.ZodEnum:
    case z.ZodFirstPartyTypeKind.ZodNativeEnum:
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return field.safeParse(value).success;
    case z.ZodFirstPartyTypeKind.ZodArray:
    case z.ZodFirstPartyTypeKind.ZodTuple:
      return Array.isArray(value);
    case z.ZodFirstPartyTypeKind.ZodObject:
    case z.ZodFirstPartyTypeKind.ZodRecord:
    case z.ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    default:
      return undefined;
  }
}

function usesLegacyInference(field: z.ZodTypeAny): boolean {
  const kind = getFieldKind(field);
  return (
    kind === z.ZodFirstPartyTypeKind.ZodAny ||
    kind === z.ZodFirstPartyTypeKind.ZodUnknown
  );
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
  return fields.some(usesLegacyInference) ? parseValue(raw) : raw;
}
