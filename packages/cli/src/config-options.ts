import {
  type MidsceneYamlTargetConfig,
  midsceneYamlTargetKeys,
} from '@midscene/core/yaml';

export const defaultConfig = {
  concurrent: 1,
  continueOnError: false,
  retry: 0,
  shareBrowserContext: false,
  headed: false,
  keepWindow: false,
  dotenvOverride: false,
  dotenvDebug: false,
};

/** Keep only target overrides before merging them into a YAML script. */
export function pickYamlTargetConfig(
  config: MidsceneYamlTargetConfig,
): MidsceneYamlTargetConfig {
  const targetConfig: MidsceneYamlTargetConfig = {};

  for (const target of midsceneYamlTargetKeys) {
    const value = config[target];
    if (typeof value !== 'undefined') {
      Object.assign(targetConfig, { [target]: value });
    }
  }

  return targetConfig;
}
