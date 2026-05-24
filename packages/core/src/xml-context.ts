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

export function hasXmlContextContent(context: string | undefined): boolean {
  const trimmedContext = context?.trim();
  if (!trimmedContext) {
    return false;
  }

  const pageTreeMatches = [
    ...trimmedContext.matchAll(
      /<PageElementsTree\b[^>]*>([\s\S]*?)<\/PageElementsTree>/gi,
    ),
  ];
  if (pageTreeMatches.length === 0) {
    return true;
  }

  return pageTreeMatches.some((match) => match[1].trim().length > 0);
}
