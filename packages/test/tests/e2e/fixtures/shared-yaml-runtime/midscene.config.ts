import { fileURLToPath } from 'node:url';
import { Agent } from '@midscene/core/agent';
import { defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import {
  type YamlRuntimeContext,
  createYamlProjectSetup,
} from '@midscene/test/runtime';

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
  legacy: { getOptions: (context) => ({ agent: context!.agent }) },
  nodes: createMidsceneNodes<YamlRuntimeContext>({
    agentClass: Agent,
    getAgent: ({ context }) => context.agent,
  }),
});
