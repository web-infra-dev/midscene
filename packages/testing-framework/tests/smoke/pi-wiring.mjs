import { Type } from '@earendil-works/pi-ai';
// Validates decision C′: Pi can be pointed at a custom OpenAI-compatible base
// URL (MIDSCENE_MODEL_BASE_URL) so verify/agent share the UI Agent endpoint.
// This constructs the provider + session WITHOUT making a network call.
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  defineTool,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';

const baseUrl =
  process.env.MIDSCENE_MODEL_BASE_URL ?? 'https://example.test/v1';
const apiKey = process.env.MIDSCENE_MODEL_API_KEY ?? 'sk-fake';
const modelName = process.env.MIDSCENE_MODEL_NAME ?? 'fake-model';

const authStorage = AuthStorage.inMemory();
const registry = ModelRegistry.inMemory(authStorage);
registry.registerProvider('midscene', {
  baseUrl,
  apiKey,
  models: [
    {
      id: modelName,
      name: modelName,
      api: 'openai-completions',
      reasoning: false,
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    },
  ],
});

const model = registry.find('midscene', modelName);
if (!model) throw new Error('model not found after registerProvider');
if (model.baseUrl !== baseUrl) throw new Error('baseUrl override failed');
if (!registry.hasConfiguredAuth(model)) throw new Error('auth not configured');

const auth = await registry.getApiKeyAndHeaders(model);
if (!auth.ok || auth.apiKey !== apiKey)
  throw new Error('apiKey resolution failed');

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  noExtensions: true,
  noThemes: true,
  noPromptTemplates: true,
});
await loader.reload();

const reportVerdict = defineTool({
  name: 'report_verdict',
  label: 'Report verdict',
  description: 'submit verdict',
  parameters: Type.Object({ pass: Type.Boolean(), reason: Type.String() }),
  execute: async (_id, p) => ({
    content: [{ type: 'text', text: 'ok' }],
    details: p,
    terminate: true,
  }),
});

const { session } = await createAgentSession({
  cwd: process.cwd(),
  model,
  modelRegistry: registry,
  authStorage,
  sessionManager: SessionManager.inMemory(),
  resourceLoader: loader,
  customTools: [reportVerdict],
  excludeTools: ['edit', 'write'],
});

if (!session.model) throw new Error('session has no model');
if (session.model.baseUrl !== baseUrl)
  throw new Error('session model baseUrl mismatch');
const toolNames = session.getActiveToolNames();
if (!toolNames.includes('report_verdict'))
  throw new Error(`report_verdict not active; got: ${toolNames.join(',')}`);

session.dispose();
console.log('PI_WIRING_OK', {
  model: session?.model?.id,
  baseUrl: model.baseUrl,
  activeTools: toolNames,
});
