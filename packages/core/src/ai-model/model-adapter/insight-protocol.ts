import type { JsonParser } from '../shared/json';
import type { BooleanFn } from '../workflows/insight/boolean';

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
  booleanFn?: BooleanFn;
  protocol: InsightProtocol;
};

export type InsightDefinition = {
  booleanFn?: BooleanFn;
  protocol?: InsightProtocolDefinition;
};
