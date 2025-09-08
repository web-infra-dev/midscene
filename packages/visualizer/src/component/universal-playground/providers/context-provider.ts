import type { UIContext } from '@midscene/core';
import type { ContextProvider } from '../types';

/**
 * Base context provider implementation
 */
export abstract class BaseContextProvider implements ContextProvider {
  protected cachedContext?: UIContext;

  abstract getUIContext(): Promise<UIContext>;

  async refreshContext(): Promise<UIContext> {
    this.cachedContext = undefined;
    return await this.getUIContext();
  }
}

/**
 * Agent-based context provider for local execution modes
 */
export class AgentContextProvider extends BaseContextProvider {
  constructor(
    private getAgent: () => any,
    private options?: { forceSameTabNavigation?: boolean },
  ) {
    super();
  }

  async getUIContext(): Promise<UIContext> {
    if (this.cachedContext) {
      return this.cachedContext;
    }

    const agent = this.getAgent();
    if (!agent?.getUIContext) {
      throw new Error('Agent does not support getUIContext');
    }

    const context = await agent.getUIContext();
    this.cachedContext = context;
    return context;
  }
}

/**
 * Static context provider for pre-determined UI contexts
 */
export class StaticContextProvider extends BaseContextProvider {
  constructor(private context: UIContext) {
    super();
  }

  async getUIContext(): Promise<UIContext> {
    return this.context;
  }

  async refreshContext(): Promise<UIContext> {
    // Static context doesn't change
    return this.context;
  }
}

/**
 * No-op context provider for cases where context preview is disabled
 */
export class NoOpContextProvider implements ContextProvider {
  async getUIContext(): Promise<UIContext> {
    throw new Error('Context preview is disabled');
  }

  async refreshContext(): Promise<UIContext> {
    throw new Error('Context preview is disabled');
  }
}
