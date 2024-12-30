export { callToGetJSONObject } from './openai';
export { systemPromptToFindElement } from './prompt/element_inspector';
export { describeUserPage } from './prompt/util';

export type { ChatCompletionMessageParam } from 'openai/resources';

export {
  AiInspectElement,
  AiExtractElementInfo,
  AiAssert,
  transformElementPositionToId,
} from './inspect';

export { findElementPoin } from './prompt/find_element_point';
export { plan } from './automation';
export { planTargetAction } from './prompt/plan-action';
export { callAiFn } from './common';
