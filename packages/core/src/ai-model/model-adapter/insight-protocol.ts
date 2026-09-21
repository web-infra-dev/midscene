import type { JsonParser } from '../shared/json';

export type InsightDataOutputProtocol = {
  /** Ordered XML tags delimiting the model-specific data output. */
  tagNames: readonly [string, ...string[]];
  rules: string;
  placeholder: string;
  buildExample: (serializedData: string) => string;
  parse: <T>(content: string) => T;
};

export type InsightProtocol = {
  responsePrefix?: string;
  dataOutput: InsightDataOutputProtocol;
};

export type InsightProtocolContext = {
  jsonParser: JsonParser;
};

export type InsightProtocolFactory = (
  context: InsightProtocolContext,
) => InsightProtocol;

export type InsightProtocolDefinition =
  | InsightProtocol
  | InsightProtocolFactory;

export type InsightAdapter = {
  protocol: InsightProtocol;
};

export type InsightDefinition = {
  protocol?: InsightProtocolDefinition;
};
