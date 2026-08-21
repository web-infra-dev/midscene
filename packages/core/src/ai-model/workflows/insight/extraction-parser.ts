import type { AIDataExtractionResponse } from '@/types';
import { parseModelResponseJson } from '../../shared/json';
import { extractXMLTag } from '../../shared/xml';

/**
 * Parse an insight XML response into extracted data.
 */
export function parseXMLExtractionResponse<T>(
  xmlString: string,
): AIDataExtractionResponse<T> {
  // Keep the internal field named `thought`, but ask models to emit
  // <observation>. Gemini may only return <thought>-named content when
  // thinking summaries are enabled.
  const thought = extractXMLTag(xmlString, 'observation');
  const dataJsonStr = extractXMLTag(xmlString, 'data-json');
  const errorsStr = extractXMLTag(xmlString, 'errors');

  // Parse data-json (required)
  if (!dataJsonStr) {
    throw new Error('Missing required field: data-json');
  }

  let data: T;
  try {
    data = parseModelResponseJson(dataJsonStr, {
      source: 'generic-object',
      requireObject: false,
    }) as T;
  } catch (e) {
    throw new Error(`Failed to parse data-json: ${e}`);
  }

  // Parse errors (optional)
  let errors: string[] | undefined;
  if (errorsStr) {
    try {
      const parsedErrors = parseModelResponseJson(errorsStr, {
        source: 'generic-object',
        requireObject: false,
      });
      if (Array.isArray(parsedErrors)) {
        errors = parsedErrors;
      }
    } catch (e) {
      // If errors parsing fails, just ignore it
    }
  }

  return {
    ...(thought ? { thought } : {}),
    data,
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
}
