import { parseBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { camelToKebab, getKeyAliases } from '../key-alias-utils';
import {
  createNamespacedInitArgSchema,
  extractNamespacedArgs,
  sanitizeNamespacedArgs,
} from './init-arg-utils';
import {
  generateCommonTools,
  generateToolsFromActionSpace,
} from './tool-generator';
import type {
  ActionSpaceItem,
  BaseAgent,
  BaseDevice,
  IMidsceneTools,
  ToolCliMetadata,
  ToolDefinition,
  ToolSchema,
} from './types';

const debug = getDebug('mcp:base-tools');

/**
 * Declarative description of a platform's agent init args.
 * Collapses the `extractAgentInitParam` / `sanitizeToolArgs` /
 * `getAgentInitArgSchema` trio into a single data declaration.
 */
export interface InitArgSpec<TInitParam> {
  /** Arg namespace, e.g. `android`, `ios`. */
  namespace: string;
  /** Zod shape describing the init args. Field names drive the MCP schema. */
  shape: Record<string, z.ZodTypeAny>;
  /**
   * Optional CLI presentation hints. These affect `--help` output for
   * single-platform CLIs but do not alter MCP/YAML protocol keys.
   */
  cli?: {
    /** Prefer bare `--device-id`-style options in platform CLI help output. */
    preferBareKeys?: boolean;
    /** Override the displayed option name for specific init arg fields. */
    preferredNames?: Record<string, string>;
  };
  /**
   * Adapt extracted namespaced args into the concrete `TInitParam` passed to
   * `ensureAgent`. Defaults to returning the raw extracted record.
   */
  adapt?: (
    extracted: Record<string, unknown> | undefined,
  ) => TInitParam | undefined;
}

/**
 * Base class for platform-specific MCP tools.
 * @typeParam TAgent - Platform-specific agent type.
 * @typeParam TInitParam - Platform-specific init parameter consumed by
 *   `ensureAgent`. Defaults to `undefined` for platforms that take no args.
 */
export abstract class BaseMidsceneTools<
  TAgent extends BaseAgent = BaseAgent,
  TInitParam = unknown,
> implements IMidsceneTools
{
  protected mcpServer?: McpServer;
  protected agent?: TAgent;
  protected toolDefinitions: ToolDefinition[] = [];

  /**
   * Declarative init-arg spec. Subclasses that accept CLI/MCP init args should
   * set this once and get `extractAgentInitParam` / `sanitizeToolArgs` /
   * `getAgentInitArgSchema` auto-implemented.
   *
   * Declared with `declare` so that TS doesn't emit an `Object.defineProperty`
   * for this field on the base constructor, which would otherwise overwrite
   * a subclass field initializer under `useDefineForClassFields`.
   */
  protected declare readonly initArgSpec?: InitArgSpec<TInitParam>;

  /**
   * Ensure agent is initialized and ready for use.
   * Must be implemented by subclasses to create platform-specific agent.
   * @param initParam Optional initialization parameter (platform-specific, e.g., URL, device ID)
   * @returns Promise resolving to initialized agent instance
   * @throws Error if agent initialization fails
   */
  protected abstract ensureAgent(initParam?: TInitParam): Promise<TAgent>;

  private getInitArgKeys(): readonly string[] {
    return this.initArgSpec ? Object.keys(this.initArgSpec.shape) : [];
  }

  /**
   * Extract a platform-specific agent init parameter from CLI/MCP tool args.
   */
  protected extractAgentInitParam(
    args: Record<string, unknown>,
  ): TInitParam | undefined {
    if (!this.initArgSpec) {
      return undefined;
    }
    const extracted = extractNamespacedArgs(
      args,
      this.initArgSpec.namespace,
      this.getInitArgKeys(),
    );
    if (this.initArgSpec.adapt) {
      return this.initArgSpec.adapt(extracted);
    }
    return extracted as TInitParam | undefined;
  }

  /**
   * Remove platform-specific init args before dispatching a tool payload to the action itself.
   */
  protected sanitizeToolArgs(
    args: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!this.initArgSpec) {
      return args;
    }
    return sanitizeNamespacedArgs(
      args,
      this.initArgSpec.namespace,
      this.getInitArgKeys(),
    );
  }

  /**
   * Expose platform-specific init args on action/common tool schemas.
   */
  protected getAgentInitArgSchema(): ToolSchema {
    if (!this.initArgSpec) {
      return {};
    }
    return createNamespacedInitArgSchema(
      this.initArgSpec.namespace,
      this.initArgSpec.shape,
    );
  }

  /**
   * Expose CLI-only metadata for platform init args so single-platform help can
   * show ergonomic bare flags while the underlying schema stays namespaced.
   * When `preferBareKeys` is enabled, single-platform CLIs only accept the
   * bare spellings; namespaced dotted spellings remain available through the
   * MCP/YAML schema instead of the platform CLI surface.
   */
  protected getAgentInitArgCliMetadata(): ToolCliMetadata | undefined {
    if (!this.initArgSpec?.cli) {
      return undefined;
    }

    const options = Object.fromEntries(
      this.getInitArgKeys().map((key) => {
        const canonicalKey = `${this.initArgSpec!.namespace}.${key}`;
        const preferredName =
          this.initArgSpec!.cli?.preferredNames?.[key] ??
          (this.initArgSpec!.cli?.preferBareKeys
            ? camelToKebab(key)
            : canonicalKey);

        const acceptedNames = new Set<string>([
          preferredName,
          ...(this.initArgSpec!.cli?.preferBareKeys
            ? getKeyAliases(key)
            : getKeyAliases(canonicalKey)),
        ]);
        acceptedNames.delete(preferredName);

        return [
          canonicalKey,
          {
            preferredName,
            aliases: [...acceptedNames],
          },
        ];
      }),
    );

    return { options };
  }

  /**
   * Optional: prepare platform-specific tools (e.g., device connection)
   */
  protected preparePlatformTools(): ToolDefinition[] {
    return [];
  }

  /**
   * Must be implemented by subclasses to create a temporary device instance
   * This allows getting real actionSpace without connecting to device
   */
  protected abstract createTemporaryDevice(): BaseDevice;

  /**
   * Initialize all tools by querying actionSpace
   * Uses two-layer fallback strategy:
   * 1. Try to get actionSpace from connected agent (if available)
   * 2. Create temporary device instance to read actionSpace (always succeeds)
   */
  public async initTools(): Promise<void> {
    this.toolDefinitions = [];

    // 1. Add platform-specific tools first (device connection, etc.)
    // These don't require an agent and should always be available
    const platformTools = this.preparePlatformTools();
    this.toolDefinitions.push(...platformTools);

    // 2. Get action space: use pre-set agent if available, otherwise temp device.
    //    When called via mcpKitForAgent(), agent is set before initTools().
    //    For CLI usage, agent is deferred to the first real command.
    let actionSpace: ActionSpaceItem[];
    if (this.agent) {
      actionSpace = await this.agent.getActionSpace();
      debug(
        'Action space from agent:',
        actionSpace.map((a) => a.name).join(', '),
      );
    } else {
      const tempDevice = this.createTemporaryDevice();
      actionSpace = tempDevice.actionSpace();
      await tempDevice.destroy?.();
      debug(
        'Action space from temporary device:',
        actionSpace.map((a) => a.name).join(', '),
      );
    }

    // 3. Generate tools from action space (core innovation)
    const actionTools = generateToolsFromActionSpace(
      actionSpace,
      (args = {}) => this.ensureAgent(this.extractAgentInitParam(args)),
      (args = {}) => this.sanitizeToolArgs(args),
      this.getAgentInitArgSchema(),
      this.getAgentInitArgCliMetadata(),
    );

    // 4. Add common tools (screenshot, waitFor)
    const commonTools = generateCommonTools(
      (args = {}) => this.ensureAgent(this.extractAgentInitParam(args)),
      this.getAgentInitArgSchema(),
      this.getAgentInitArgCliMetadata(),
    );
    this.toolDefinitions.push(...actionTools, ...commonTools);

    debug('Total tools prepared:', this.toolDefinitions.length);
  }

  /**
   * Attach to MCP server and register all tools
   */
  public attachToServer(server: McpServer): void {
    this.mcpServer = server;

    if (this.toolDefinitions.length === 0) {
      debug('Warning: No tools to register. Tools may be initialized lazily.');
    }

    for (const toolDef of this.toolDefinitions) {
      this.mcpServer.tool(
        toolDef.name,
        toolDef.description,
        toolDef.schema,
        toolDef.handler,
      );
    }

    debug('Registered', this.toolDefinitions.length, 'tools');
  }

  /**
   * Cleanup method - destroy agent and release resources
   */
  public async destroy(): Promise<void> {
    await this.agent?.destroy?.();
  }

  /**
   * Get tool definitions
   */
  public getToolDefinitions(): ToolDefinition[] {
    return this.toolDefinitions;
  }

  /**
   * Set agent for the tools manager
   */
  public setAgent(agent: TAgent): void {
    this.agent = agent;
  }

  /**
   * Helper: Convert base64 screenshot to image content array
   */
  protected buildScreenshotContent(screenshot: string) {
    const { mimeType, body } = parseBase64(screenshot);
    return [
      {
        type: 'image' as const,
        data: body,
        mimeType,
      },
    ];
  }

  /**
   * Helper: Build a simple text result for tool responses
   */
  protected buildTextResult(text: string) {
    return {
      content: [{ type: 'text' as const, text }],
    };
  }

  /**
   * Create a disconnect handler for releasing platform resources
   * @param platformName Human-readable platform name for the response message
   * @returns Handler function that destroys the agent and returns appropriate response
   */
  protected createDisconnectHandler(platformName: string) {
    return async () => {
      if (!this.agent) {
        return this.buildTextResult('No active connection to disconnect');
      }

      try {
        await this.agent.destroy?.();
      } catch (error) {
        debug('Failed to destroy agent during disconnect:', error);
      }
      this.agent = undefined;

      return this.buildTextResult(`Disconnected from ${platformName}`);
    };
  }
}
