import { getTemperatureWithSemanticRetry } from './temperature-with-semantic-retry';
import type {
  BuildResponsesParams,
  MidsceneResponsesDefaults,
  ModelAdapterDefinition,
  ResponsesAdapter,
} from './types';

const midsceneResponsesDefaults: MidsceneResponsesDefaults = {
  temperature: 0,
};

export const buildDefaultResponsesParams: BuildResponsesParams = ({
  midsceneDefaults,
  userConfig,
}) => ({
  config: {
    temperature: userConfig.temperature ?? midsceneDefaults.temperature,
  },
});

export function resolveResponses(
  responses: ModelAdapterDefinition['responses'],
): ResponsesAdapter {
  const buildResponsesParams =
    responses?.buildResponsesParams ?? buildDefaultResponsesParams;
  return {
    unsupportedUserConfig: responses?.unsupportedUserConfig ?? [],
    buildResponsesParams: (input) => {
      const context = {
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneResponsesDefaults,
      };
      const params = buildResponsesParams(context);
      return {
        ...params,
        config: {
          ...params.config,
          temperature: getTemperatureWithSemanticRetry({
            temperature: params.config.temperature,
            userTemperature: input.userConfig?.temperature,
            semanticRetryAttempt: input.semanticRetryAttempt,
          }),
        },
      };
    },
  };
}
