import type { IModelConfig } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';
import { getVersion } from '../../../utils';
import { createProxyAgentIfNeeded } from '../proxy';
import { getSystemOneDialect, getSystemOneLabel } from './dialect';
import { resolveSystemOneEndpoint } from './resolve-endpoint';
import type { SystemOneRequest } from './schema';
import { encodeDrexImages, encodeSystemOneImages } from './utils';

const MiB = 1024 * 1024;
const DREX_MAX_QUESTIONS = 512;

function buildJevRequest(
  config: IModelConfig,
  request: SystemOneRequest,
  url: string,
) {
  const isOpenRouter = new URL(url).hostname === 'openrouter.ai';
  const { imageState, assets } = encodeSystemOneImages(
    request.images,
    isOpenRouter,
  );
  return {
    body: {
      ...config.extraBody,
      model: config.modelName,
      state: { ...request.state, ...imageState },
      questions: request.questions,
      ...(!isOpenRouter && Object.keys(assets).length ? { assets } : {}),
    },
    headers: { 'TypeSafe-Danger-Zone-Images': 'true' },
    bodyLimit: 32 * MiB,
  };
}

function buildDrexRequest(config: IModelConfig, request: SystemOneRequest) {
  assert(
    Object.keys(request.questions).length <= DREX_MAX_QUESTIONS,
    `Drex accepts at most ${DREX_MAX_QUESTIONS} questions per request`,
  );
  for (const [name, question] of Object.entries(request.questions)) {
    assert(
      question.type !== 'box',
      `Drex does not support the box question type (question "${name}"), so it cannot locate elements. Configure a different Locate model.`,
    );
    assert(
      typeof question.instructions === 'string',
      `Drex requires string instructions (question "${name}")`,
    );
  }
  const { imageState, images } = encodeDrexImages(request.images);
  return {
    body: {
      ...config.extraBody,
      model: config.modelName,
      state: { ...request.state, ...imageState },
      questions: request.questions,
      ...(images.length ? { images } : {}),
    },
    headers: {},
    bodyLimit: 4 * MiB,
  };
}

function assertDrexKeyOrigin(config: IModelConfig, url: string, label: string) {
  assert(
    config.openaiBaseURL,
    `${label} requires MIDSCENE_*_MODEL_BASE_URL so the API key can be restricted to its origin`,
  );
  assert(
    new URL(url).origin === new URL(config.openaiBaseURL).origin,
    `${label} endpoint ${url} is not on the origin of the configured base URL ${config.openaiBaseURL}; refusing to send the API key to a different origin`,
  );
}

export async function prepareSystemOne(
  config: IModelConfig,
  request: SystemOneRequest,
) {
  const label = getSystemOneLabel(config);
  assert(config.openaiApiKey, `${label} requires MIDSCENE_*_MODEL_API_KEY`);
  assert(
    !config.protocol || config.protocol === 'openai-chat',
    `${label} uses System One, not the Responses API`,
  );
  const url = resolveSystemOneEndpoint(config);
  if (getSystemOneDialect(config) === 'drex') {
    assertDrexKeyOrigin(config, url, label);
  }
  const { body, headers, bodyLimit } =
    getSystemOneDialect(config) === 'drex'
      ? buildDrexRequest(config, request)
      : buildJevRequest(config, request, url);
  const serializedBody = JSON.stringify(body);
  assert(
    new TextEncoder().encode(serializedBody).length <= bodyLimit,
    `${label} request exceeds the ${bodyLimit / MiB} MiB body limit`,
  );
  return {
    url,
    body: serializedBody,
    questions: request.questions,
    label,
    headers: {
      ...(config.openaiExtraConfig?.defaultHeaders as
        | Record<string, string>
        | undefined),
      Authorization: `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json',
      ...headers,
      'x-midscene-version': getVersion(),
    },
    dispatcher: await createProxyAgentIfNeeded({
      socksProxy: config.socksProxy,
      httpProxy: config.httpProxy,
    }),
  };
}
