import { type LocatorTarget, LocatorTargetSchema } from '@/locator';
import yaml from 'js-yaml';
import { z } from 'zod';

const hasInvalidProtocolNameCharacter = (name: string): boolean =>
  Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === '<' ||
      character === '>' ||
      codePoint === undefined ||
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    );
  });

const protocolNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => !hasInvalidProtocolNameCharacter(name), {
    message:
      'must not contain angle brackets, line breaks, or control characters',
  });

const extraActionDefinitionSchema = z
  .object({
    name: protocolNameSchema,
    validWhenTargetExists: LocatorTargetSchema.optional(),
    action: z
      .object({
        name: z.string().trim().min(1),
        param: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

const extraActionManifestSchema = z
  .object({
    version: z.literal(1),
    interface: z.string().trim().min(1),
    actions: z.array(extraActionDefinitionSchema).min(1),
  })
  .strict();

const legacyExtraActionFileSchema = z
  .object({
    name: protocolNameSchema,
    actionName: z.string().trim().min(1),
    actionParam: z.tuple([z.unknown()]),
  })
  .strict();

export type ExtraActionDefinition = z.infer<typeof extraActionDefinitionSchema>;

export type ExtraActionManifest = z.infer<typeof extraActionManifestSchema>;

export interface ParsedExtraActionFile {
  manifestInterface?: string;
  definitions: ExtraActionDefinition[];
  legacy: boolean;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
}

function parseYaml(content: string, sourcePath: string): unknown {
  try {
    return yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new Error(
      `Failed to parse extra action file "${sourcePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * The single parsing boundary for both loaded and generated action manifests.
 * Legacy one-action files are accepted for reads, but all callers receive the
 * same canonical definition shape.
 */
export function parseExtraActionFile(
  content: string,
  sourcePath: string,
): ParsedExtraActionFile {
  const parsed = parseYaml(content, sourcePath);
  const looksLikeManifest =
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    ('version' in parsed || 'interface' in parsed || 'actions' in parsed);

  if (looksLikeManifest) {
    const result = extraActionManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid extra action file "${sourcePath}": ${formatIssues(result.error)}`,
      );
    }
    return {
      manifestInterface: result.data.interface,
      definitions: result.data.actions,
      legacy: false,
    };
  }

  const legacy = legacyExtraActionFileSchema.safeParse(parsed);
  if (!legacy.success) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": ${formatIssues(legacy.error)}`,
    );
  }
  return {
    definitions: [
      {
        name: legacy.data.name,
        action: {
          name: legacy.data.actionName,
          param: legacy.data.actionParam[0],
        },
      },
    ],
    legacy: true,
  };
}

/** Validate generated YAML through the same strict schema used by the loader. */
export function parseExtraActionManifest(
  content: string,
  sourcePath: string,
): ExtraActionManifest {
  const parsed = parseExtraActionFile(content, sourcePath);
  if (parsed.legacy || !parsed.manifestInterface) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": expected a versioned Action Manifest`,
    );
  }
  return {
    version: 1,
    interface: parsed.manifestInterface,
    actions: parsed.definitions,
  };
}

export type { LocatorTarget };
