import type { JsonParser } from '../shared/json';
import type {
  LocateResultPromptSpec,
  RawLocateValue,
} from '../shared/model-locate-result';

export type ParsedLocateResponse =
  | {
      kind: 'located';
      target: RawLocateValue;
      references?: RawLocateValue[];
      error?: string;
    }
  | {
      kind: 'not-found';
      error?: string;
    };

export type StandardLocateProtocol = {
  systemPromptIntroduction: string;
  buildResponseInstructions: (
    locatePromptSpec: LocateResultPromptSpec,
  ) => string;
  buildUserPrompt: (targetElementDescription: string) => string;
  expectedJsonObjectResponse: boolean;
  parseRawResponse: (
    content: string,
    locatePromptSpec: LocateResultPromptSpec,
  ) => ParsedLocateResponse;
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
