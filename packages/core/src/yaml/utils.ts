import type {
  DetailedLocateParam,
  LocateOption,
  MidsceneYamlScript,
  TUserPrompt,
} from '@/index';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import yaml from 'js-yaml';

const debugUtils = getDebug('yaml:utils');

export function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const value = process.env[envVar.trim()];
    if (value === undefined) {
      throw new Error(`Environment variable "${envVar.trim()}" is not defined`);
    }
    return value;
  });
}

export function parseYamlScript(
  content: string,
  filePath?: string,
  ignoreCheckingTarget?: boolean,
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
  const android =
    typeof obj.android !== 'undefined'
      ? Object.assign({}, obj.android || {})
      : undefined;
  const ios =
    typeof obj.ios !== 'undefined'
      ? Object.assign({}, obj.ios || {})
      : undefined;
  const webConfig = obj.web || obj.target; // no need to handle null case, because web has required parameters url
  const web =
    typeof webConfig !== 'undefined'
      ? Object.assign({}, webConfig || {})
      : undefined;

  if (!ignoreCheckingTarget) {
    // make sure at least one of target/web/android/ios is provided
    assert(
      web || android || ios,
      `at least one of "target", "web", "android", or "ios" properties is required in yaml script${pathTip}`,
    );

    // make sure only one of target/web/android/ios is provided
    const configCount = [web, android, ios].filter(Boolean).length;
    assert(
      configCount === 1,
      `only one of "target", "web", "android", or "ios" properties is allowed in yaml script${pathTip}`,
    );

    // make sure the config is valid
    if (web || android || ios) {
      assert(
        typeof web === 'object' ||
          typeof android === 'object' ||
          typeof ios === 'object',
        `property "target/web/android/ios" must be an object${pathTip}`,
      );
    }
  }

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
