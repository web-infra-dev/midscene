import type { TUserPrompt } from '@/ai-model/common';
import type {
  DetailedLocateParam,
  LocateOption,
  MidsceneYamlScript,
} from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import yaml from 'js-yaml';

const debugUtils = getDebug('yaml:utils');

export function interpolateEnvVars(content: string): string {
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
    return line.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
      const value = process.env[envVar.trim()];
      if (value === undefined) {
        throw new Error(`Environment variable "${envVar.trim()}" is not defined`);
      }
      return value;
    });
  });
  
  return processedLines.join('\n');
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
  const interpolatedContent = interpolateEnvVars(processedContent);
  const obj = yaml.load(interpolatedContent, {
    schema: yaml.JSON_SCHEMA,
  }) as MidsceneYamlScript;

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
  let prompt = locatePrompt || opt?.prompt || (opt as any)?.locate; // as a shortcut
  let deepThink = false;
  let cacheable = true;
  let xpath = undefined;

  if (typeof opt === 'object' && opt !== null) {
    deepThink = opt.deepThink ?? false;
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

  return {
    prompt,
    deepThink,
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
  const locateParam = buildDetailedLocateParam(locatePrompt, opt);

  // Extract all keys from opt except the ones already included in locateParam
  const restParams: Record<string, any> = {};

  if (typeof opt === 'object' && opt !== null) {
    // Get all keys from opt
    const allKeys = Object.keys(opt);

    // Keys already included in locateParam: prompt, deepThink, cacheable, xpath
    const locateParamKeys = Object.keys(locateParam || {});

    // Extract all other keys
    for (const key of allKeys) {
      if (
        !locateParamKeys.includes(key) &&
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
