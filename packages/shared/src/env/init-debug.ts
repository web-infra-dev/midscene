import { enableDebug } from '../logger';
import { getBasicEnvValue } from './basic';
import { MIDSCENE_DEBUG_AI_PROFILE, MIDSCENE_DEBUG_AI_RESPONSE } from './types';

export const initDebugConfig = () => {
  const shouldPrintTiming = getBasicEnvValue(MIDSCENE_DEBUG_AI_PROFILE);
  let debugConfig = '';
  if (shouldPrintTiming) {
    console.warn(
      'MIDSCENE_DEBUG_AI_PROFILE is deprecated, use DEBUG=midscene:ai:profile instead',
    );
    debugConfig = 'ai:profile';
  }
  const shouldPrintAIResponse = getBasicEnvValue(MIDSCENE_DEBUG_AI_RESPONSE);

  if (shouldPrintAIResponse) {
    console.warn(
      'MIDSCENE_DEBUG_AI_RESPONSE is deprecated, use DEBUG=midscene:ai:response instead',
    );
    if (debugConfig) {
      debugConfig = 'ai:*';
    } else {
      debugConfig = 'ai:call';
    }
  }
  if (debugConfig) {
    enableDebug(debugConfig);
  }
};
