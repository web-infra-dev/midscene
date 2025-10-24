import { enableDebug } from '../logger';
import { getBasicEnvValue } from './basic';
import {
  MIDSCENE_DEBUG_MODEL_PROFILE,
  MIDSCENE_DEBUG_MODEL_RESPONSE,
} from './types';

export const initDebugConfig = () => {
  const shouldPrintTiming = getBasicEnvValue(MIDSCENE_DEBUG_MODEL_PROFILE);
  let debugConfig = '';
  if (shouldPrintTiming) {
    console.warn(
      'MIDSCENE_DEBUG_MODEL_PROFILE is deprecated, use DEBUG=midscene:ai:profile instead',
    );
    debugConfig = 'ai:profile';
  }
  const shouldPrintModelResponse = getBasicEnvValue(
    MIDSCENE_DEBUG_MODEL_RESPONSE,
  );

  if (shouldPrintModelResponse) {
    console.warn(
      'MIDSCENE_DEBUG_MODEL_RESPONSE is deprecated, use DEBUG=midscene:ai:response instead',
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
