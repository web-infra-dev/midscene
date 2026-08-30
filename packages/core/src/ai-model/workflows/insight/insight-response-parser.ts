import type { AIDataExtractionResponse } from '@/types';
import type { InsightDataOutputProtocol } from '../../model-adapter/insight-protocol';
import type { JsonParser } from '../../shared/json';
import { extractRawXMLFragment, extractXMLTag } from '../../shared/xml';

export function parseInsightResponse<T>(
  content: string,
  dataOutputProtocol: InsightDataOutputProtocol,
  jsonParser: JsonParser,
): AIDataExtractionResponse<T> {
  const observation = extractXMLTag(content, 'observation');
  const errorsContent = extractXMLTag(content, 'errors');
  const rawDataOutput = extractRawXMLFragment(
    content,
    dataOutputProtocol.tagNames,
  );
  const data = dataOutputProtocol.parse<T>(rawDataOutput);

  let errors: string[] | undefined;
  if (errorsContent) {
    try {
      const parsedErrors = jsonParser(errorsContent, {
        source: 'generic-object',
        requireObject: false,
      });
      if (Array.isArray(parsedErrors)) {
        errors = parsedErrors;
      }
    } catch {
      // Error details are optional and must not discard valid extracted data.
    }
  }

  return {
    ...(observation ? { thought: observation } : {}),
    data,
    ...(errors?.length ? { errors } : {}),
  };
}
