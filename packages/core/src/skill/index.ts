import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { BaseMidsceneTools } from '@midscene/shared/mcp/base-tools';
import type { BaseAgent, BaseDevice } from '@midscene/shared/mcp/types';
import { Agent } from '../agent/agent';
import type { AbstractInterface } from '../device';

type DeviceClass = new (...args: any[]) => AbstractInterface;

/**
 * Skill tools manager that lazily creates Agent from a Device class.
 * Used by runSkillCLI for CLI / Agent Skills scenarios where no agent exists at startup.
 */
class SkillMidsceneTools extends BaseMidsceneTools<BaseAgent> {
  constructor(private DeviceClass: DeviceClass) {
    super();
  }

  protected createTemporaryDevice(): BaseDevice {
    return new this.DeviceClass() as unknown as BaseDevice;
  }

  protected async ensureAgent(): Promise<BaseAgent> {
    if (!this.agent) {
      const device = new this.DeviceClass();
      this.agent = new Agent(device) as unknown as BaseAgent;
    }
    return this.agent;
  }
}

export interface SkillCLIOptions {
  scriptName: string;
  DeviceClass: DeviceClass;
}

/**
 * Launch a Skill CLI for a custom interface Device class.
 * This enables AI coding assistants (Claude Code, Cline, etc.) to control
 * your custom interface through CLI commands.
 *
 * @example
 * ```typescript
 * #!/usr/bin/env node
 * import { runSkillCLI } from '@midscene/core/skill';
 * import { SampleDevice } from './sample-device';
 *
 * runSkillCLI({
 *   DeviceClass: SampleDevice,
 *   scriptName: 'my-device',
 * });
 * ```
 */
export function runSkillCLI(options: SkillCLIOptions): Promise<void> {
  const tools = new SkillMidsceneTools(options.DeviceClass);
  return runToolsCLI(tools, options.scriptName).catch((e) => {
    process.exit(reportCLIError(e));
  });
}
