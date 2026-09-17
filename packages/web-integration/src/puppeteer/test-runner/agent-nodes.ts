import type { AgentTestRunnerNodeDefinition } from '@midscene/core/agent';
import { clearCookiesNode } from './clear-cookies';
import { setCookiesNode } from './cookies';
import { gotoUrlNode } from './goto-url';
import { setViewportSizeNode } from './viewport';

export const puppeteerAgentTestRunnerNodeDefinitions: readonly AgentTestRunnerNodeDefinition[] =
  [gotoUrlNode, setCookiesNode, clearCookiesNode, setViewportSizeNode];
