import { extractXMLTag } from '../shared/xml';
import type { InsightProtocolFactory } from './insight-protocol';

const dataOutputTagName = 'data-json';

export const createDefaultInsightProtocol: InsightProtocolFactory = ({
  jsonParser,
}) => ({
  dataOutput: {
    tagNames: [dataOutputTagName],
    rules: '',
    placeholder: `<${dataOutputTagName}>the extracted data as JSON. Make sure both the value and scheme meet the DATA_DEMAND. If you want to write some description in this field, use the same language as the DATA_DEMAND.</${dataOutputTagName}>`,
    buildExample: (serializedData) => `<${dataOutputTagName}>
${serializedData}
</${dataOutputTagName}>`,
    parse: <T>(content: string): T => {
      const dataJsonContent = extractXMLTag(content, dataOutputTagName);
      if (!dataJsonContent) {
        throw new Error('Missing required field: data-json');
      }

      try {
        return jsonParser(dataJsonContent, {
          source: 'generic-object',
        }) as T;
      } catch (error) {
        throw new Error(`Failed to parse data-json: ${error}`);
      }
    },
  },
});
