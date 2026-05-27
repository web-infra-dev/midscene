import type { TMultimodalPrompt, TUserPrompt } from '@/common';
import type {
  DetailedLocateParam,
  LocateOption,
  MidsceneYamlScript,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import yaml from 'js-yaml';

const debugUtils = getDebug('yaml:utils');

function replaceEnvVarRefs(
  line: string,
  options: { preserveMissing?: boolean },
) {
  let result = '';
  let lastIndex = 0;
  let searchFrom = 0;

  while (searchFrom < line.length) {
    const start = line.indexOf('${', searchFrom);
    if (start === -1) {
      break;
    }

    const end = line.indexOf('}', start + 2);
    if (end === -1) {
      break;
    }

    const rawName = line.slice(start + 2, end);
    if (!rawName) {
      searchFrom = end + 1;
      continue;
    }

    const envVar = rawName.trim();
    const value = process.env[envVar];
    result += line.slice(lastIndex, start);
    if (value === undefined) {
      if (options.preserveMissing) {
        result += line.slice(start, end + 1);
      } else {
        throw new Error(`Environment variable "${envVar}" is not defined`);
      }
    } else {
      result += value;
    }
    lastIndex = end + 1;
    searchFrom = end + 1;
  }

  return result + line.slice(lastIndex);
}

function assertNoMissingEnvVarsInString(value: string) {
  let searchFrom = 0;

  while (searchFrom < value.length) {
    const start = value.indexOf('${', searchFrom);
    if (start === -1) {
      return;
    }

    const end = value.indexOf('}', start + 2);
    if (end === -1) {
      return;
    }

    const rawName = value.slice(start + 2, end);
    if (rawName) {
      const envVar = rawName.trim();
      if (process.env[envVar] === undefined) {
        throw new Error(`Environment variable "${envVar}" is not defined`);
      }
    }
    searchFrom = end + 1;
  }
}

const multimodalLocateOptionFieldMap: Record<keyof TMultimodalPrompt, true> = {
  images: true,
  convertHttpImage2Base64: true,
};

const multimodalLocateOptionKeys = Object.keys(
  multimodalLocateOptionFieldMap,
) as Array<keyof TMultimodalPrompt>;

function extractMultimodalPrompt(
  opt?: LocateOption,
): Partial<TMultimodalPrompt> | undefined {
  if (typeof opt !== 'object' || opt === null) {
    return undefined;
  }

  const entries = multimodalLocateOptionKeys
    .map((key) => [key, opt[key]] as const)
    .filter(([, value]) => value !== undefined);

  return entries.length
    ? (Object.fromEntries(entries) as Partial<TMultimodalPrompt>)
    : undefined;
}

export function interpolateEnvVars(
  content: string,
  options: { preserveMissing?: boolean } = {},
): string {
  // Process line by line to skip commented lines
  const lines = content.split('\n');
  const processedLines = lines.map((line) => {
    // Check if the line is a YAML comment (starts with # after optional whitespace)
    const trimmedLine = line.trimStart();
    if (trimmedLine.startsWith('#')) {
      // Skip interpolation for comment lines
      return line;
    }

    // Process environment variables for non-comment lines
    return replaceEnvVarRefs(line, options);
  });

  return processedLines.join('\n');
}

function assertNoMissingEnvVarsOutsideTasks(
  value: unknown,
  path: string[] = [],
) {
  if (path.length === 1 && path[0] === 'tasks') {
    return;
  }

  if (typeof value === 'string') {
    assertNoMissingEnvVarsInString(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoMissingEnvVarsOutsideTasks(item, [...path, String(index)]);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assertNoMissingEnvVarsOutsideTasks(item, [...path, key]);
    }
  }
}

export function parseYamlScript(
  content: string,
  filePath?: string,
): MidsceneYamlScript {
  let processedContent = content;
  if (content.indexOf('android') !== -1 && content.match(/deviceId:\s*(\d+)/)) {
    let matchedDeviceId;
    processedContent = content.replace(
      /deviceId:\s*(\d+)/g,
      (match, deviceId) => {
        matchedDeviceId = deviceId;
        return `deviceId: '${deviceId}'`;
      },
    );
    console.warn(
      `please use string-style deviceId in yaml script, for example: deviceId: "${matchedDeviceId}"`,
    );
  }
  const interpolatedContent = interpolateEnvVars(processedContent, {
    preserveMissing: true,
  });
  const obj = yaml.load(interpolatedContent, {
    schema: yaml.JSON_SCHEMA,
  }) as MidsceneYamlScript;
  assertNoMissingEnvVarsOutsideTasks(obj);

  const pathTip = filePath ? `, failed to load ${filePath}` : '';
  assert(obj.tasks, `property "tasks" is required in yaml script ${pathTip}`);
  assert(
    Array.isArray(obj.tasks),
    `property "tasks" must be an array in yaml script, but got ${obj.tasks}`,
  );
  return obj;
}

export function buildDetailedLocateParam(
  locatePrompt: TUserPrompt,
  opt?: LocateOption,
): DetailedLocateParam | undefined {
  debugUtils('will call buildDetailedLocateParam', locatePrompt, opt);
  // Normalize object-form TUserPrompt: when the object only contains a
  // `prompt` string (no multimodal fields like `images`), unwrap it to
  // avoid double nesting like { prompt: { prompt: '...' } }.
  let normalizedLocatePrompt: TUserPrompt = locatePrompt;
  if (
    typeof locatePrompt === 'object' &&
    locatePrompt !== null &&
    'prompt' in locatePrompt
  ) {
    const { prompt: innerPrompt, ...rest } = locatePrompt;
    const hasMultimodalFields = Object.keys(rest).length > 0;
    normalizedLocatePrompt = hasMultimodalFields ? locatePrompt : innerPrompt;
  }

  let prompt = normalizedLocatePrompt || opt?.prompt || (opt as any)?.locate; // as a shortcut
  let deepLocate = false;
  let cacheable = true;
  let xpath = undefined;

  if (typeof opt === 'object' && opt !== null) {
    // Backward-compatible: accept `deepThink` as a deprecated alias for `deepLocate`.
    // All downstream code works on `deepLocate` only; the compatibility resolution
    // is intentionally kept here at the entry point so it does not bleed through
    // the rest of the call stack.
    deepLocate = opt.deepLocate ?? opt.deepThink ?? false;
    cacheable = opt.cacheable ?? true;
    xpath = opt.xpath;
    if (locatePrompt && opt.prompt && locatePrompt !== opt.prompt) {
      console.warn(
        'conflict prompt for item',
        locatePrompt,
        opt,
        'maybe you put the prompt in the wrong place',
      );
    }
    prompt = prompt || opt.prompt;
  }

  if (!prompt) {
    debugUtils(
      'no prompt, will return undefined in buildDetailedLocateParam',
      opt,
    );
    return undefined;
  }

  const multimodalPrompt = extractMultimodalPrompt(opt);
  if (multimodalPrompt) {
    prompt =
      typeof prompt === 'string'
        ? {
            prompt,
            ...multimodalPrompt,
          }
        : {
            ...prompt,
            ...multimodalPrompt,
          };
  }

  return {
    prompt,
    deepLocate,
    cacheable,
    xpath,
  };
}

export function buildDetailedLocateParamAndRestParams(
  locatePrompt: TUserPrompt,
  opt: LocateOption | undefined,
  excludeKeys: string[] = [],
): {
  locateParam: DetailedLocateParam | undefined;
  restParams: Record<string, any>;
} {
  const multimodalPrompt = extractMultimodalPrompt(opt);
  const locateParam = buildDetailedLocateParam(locatePrompt, opt);

  // Extract all keys from opt except the ones already included in locateParam
  const restParams: Record<string, any> = {};

  if (typeof opt === 'object' && opt !== null) {
    // Get all keys from opt
    const allKeys = Object.keys(opt);

    // Keys already included in locateParam: prompt, deepLocate, cacheable, xpath
    const locateParamKeys = Object.keys(locateParam || {});
    const multimodalPromptKeys =
      typeof locateParam?.prompt === 'object' && locateParam?.prompt !== null
        ? Object.keys(multimodalPrompt || {})
        : [];

    // Extract all other keys
    for (const key of allKeys) {
      if (
        !locateParamKeys.includes(key) &&
        !multimodalPromptKeys.includes(key) &&
        !excludeKeys.includes(key) &&
        key !== 'locate'
      ) {
        restParams[key] = opt[key as keyof LocateOption];
      }
    }
  }

  return {
    locateParam,
    restParams,
  };
}
