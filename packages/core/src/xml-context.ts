import type {
  ResolvedXmlContextModuleOptions,
  XmlContextIntent,
  XmlContextModuleOptions,
  XmlContextOptions,
} from './types';

export const DEFAULT_XML_CONTEXT: Record<
  XmlContextIntent,
  ResolvedXmlContextModuleOptions
> = {
  planning: {
    xml: true,
  },
  locate: {
    xml: true,
  },
};

export function resolveXmlContextForIntent(
  xmlContext: XmlContextOptions | undefined,
  intent: XmlContextIntent,
): ResolvedXmlContextModuleOptions {
  return {
    ...DEFAULT_XML_CONTEXT[intent],
    ...(xmlContext?.[intent] ?? {}),
  };
}

export function isXmlContextEnabled(
  xmlContext: XmlContextModuleOptions | ResolvedXmlContextModuleOptions,
): boolean {
  return xmlContext.xml !== false;
}
