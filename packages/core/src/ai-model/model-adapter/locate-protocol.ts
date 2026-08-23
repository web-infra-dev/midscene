import type { JsonParser } from '../shared/json';
import type { LocateResultPromptSpec } from '../shared/model-locate-result';

export type RawLocateResultObject = {
  error?: string;
  [key: string]: unknown;
};

export type StandardLocateProtocol = {
  systemPromptIntroduction: string;
  buildResponseInstructions: (
    locatePromptSpec: LocateResultPromptSpec,
  ) => string;
  buildUserPrompt: (targetElementDescription: string) => string;
  expectedJsonObjectResponse: boolean;
  parseRawResponse: (content: string) => RawLocateResultObject;
};

export type StandardLocateProtocolContext = {
  jsonParser: JsonParser;
};

export type StandardLocateProtocolFactory = (
  context: StandardLocateProtocolContext,
) => StandardLocateProtocol;

export type StandardLocateProtocolDefinition =
  | StandardLocateProtocol
  | StandardLocateProtocolFactory;
