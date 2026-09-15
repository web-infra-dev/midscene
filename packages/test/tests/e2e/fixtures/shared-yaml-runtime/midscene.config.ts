import { fileURLToPath } from 'node:url';
import { Agent } from '@midscene/core/agent';
import { defineTestProject } from '@midscene/test/config';
import {
  type YamlRuntimeContext,
  createYamlProjectSetup,
} from '@midscene/test/internal/yaml-runtime';
import { createMidsceneNodes } from '@midscene/test/midscene';

export default defineTestProject<YamlRuntimeContext>({
  setup: createYamlProjectSetup({
    file: 'runtime.yaml',
    script: {
      interface: {
        module: fileURLToPath(new URL('./device.mjs', import.meta.url)),
      },
      agent: { autoPrintReportMsg: false, reportFileName: 'shared-runtime' },
    },
    setup: 'tasks:\n  - name: setup\n    flow:\n      - javascript: setup:once',
  }),
  nodes: createMidsceneNodes<YamlRuntimeContext>({
    agentClass: Agent,
    getAgent: ({ context }) => context.agent,
  }),
});
