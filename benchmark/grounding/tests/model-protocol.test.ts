import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelConfigManager } from '@midscene/shared/env';
import { buildMidsceneModelConfig } from '../evaluation/midscene/bridge-agent.js';
import {
  loadModels,
  normalizeStoredModelsConfig,
} from '../evaluation/runtime/load-data.js';

const group = {
  id: 'test-provider',
  groupName: 'test-provider',
  baseUrl: 'http://localhost/v1',
  apiKey: 'test-only-key',
  family: 'gpt-6',
  models: [
    {
      id: 'test-model',
      name: 'gpt-6-sol',
      displayName: 'test-model',
      providerId: 'test-provider',
    },
  ],
};

test('model configs map old and new protocol settings into the current SDK', () => {
  for (const [settings, expected] of [
    [{}, 'openai-chat'],
    [{ apiType: 'responses' }, 'openai-responses'],
    [{ protocol: 'openai-responses' }, 'openai-responses'],
    [{ protocol: 'openai-chat', apiType: 'responses' }, 'openai-chat'],
  ] as const) {
    const [model] = normalizeStoredModelsConfig([{ ...group, ...settings }]);
    const config = buildMidsceneModelConfig(model);
    assert.equal(config.MIDSCENE_MODEL_PROTOCOL, expected);
    assert.equal(config.MIDSCENE_MODEL_API_TYPE, undefined);
    assert.equal(
      new ModelConfigManager(config).getModelConfig('default').protocol,
      expected,
    );
  }
  const [childOverride] = normalizeStoredModelsConfig([
    {
      ...group,
      protocol: 'openai-chat',
      models: [{ ...group.models[0], apiType: 'responses' }],
    },
  ]);
  assert.equal(childOverride.protocol, 'openai-responses');
  assert.throws(
    () => normalizeStoredModelsConfig([{ ...group, protocol: 'responses' }]),
    /protocol must be/,
  );
});

test('environment loading accepts legacy Responses and explicit current protocol', async () => {
  const keys = [
    'GROUNDING_MODELS_FILE',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_API_KEY',
    'MIDSCENE_MODEL_FAMILY',
    'MIDSCENE_MODEL_API_TYPE',
    'MIDSCENE_MODEL_PROTOCOL',
  ];
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    Reflect.deleteProperty(process.env, 'GROUNDING_MODELS_FILE');
    Reflect.deleteProperty(process.env, 'MIDSCENE_MODEL_PROTOCOL');
    Object.assign(process.env, {
      MIDSCENE_MODEL_NAME: 'gpt-6-sol',
      MIDSCENE_MODEL_BASE_URL: group.baseUrl,
      MIDSCENE_MODEL_API_KEY: group.apiKey,
      MIDSCENE_MODEL_FAMILY: group.family,
      MIDSCENE_MODEL_API_TYPE: 'responses',
    });
    assert.equal((await loadModels())[0].protocol, 'openai-responses');
    process.env.MIDSCENE_MODEL_PROTOCOL = 'openai-chat';
    assert.equal((await loadModels())[0].protocol, 'openai-chat');
    Reflect.deleteProperty(process.env, 'MIDSCENE_MODEL_API_TYPE');
    process.env.MIDSCENE_MODEL_PROTOCOL = 'openai-responses';
    assert.equal((await loadModels())[0].protocol, 'openai-responses');
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
});
