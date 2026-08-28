import { createDoubaoInsightProtocol } from '@/ai-model/models/doubao/insight-protocol';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { parseInsightResponse } from '@/ai-model/workflows/insight/insight-response-parser';
import { describe, expect, it } from '@rstest/core';

const protocol = createDoubaoInsightProtocol({
  jsonParser: parseModelResponseJson,
});
const parseDoubaoInsightResponse = (content: string) =>
  parseInsightResponse(content, protocol.dataOutput, parseModelResponseJson);

describe('doubao insight protocol', () => {
  it('builds a Seed function prompt', () => {
    expect(protocol.dataOutput.rules).toContain('"name":"extract_data"');
    expect(protocol.dataOutput.placeholder).toContain(
      '<seed:tool_call><function name="extract_data">',
    );
    expect(protocol.dataOutput.rules).not.toContain('<data-json>');
  });

  it.each([
    ['object', '{"enabled":true}', { enabled: true }],
    ['array', '["one","two"]', ['one', 'two']],
    ['string', '"Midscene"', 'Midscene'],
    ['number', '42', 42],
    ['boolean', 'false', false],
  ])('parses %s insight data', (_, rawData, expectedData) => {
    const response = `<observation>Visible evidence</observation><seed:tool_call><function name="extract_data"><parameter name="data" string="true">${rawData}</parameter></function></seed:tool_call>`;

    expect(parseDoubaoInsightResponse(response)).toEqual({
      thought: 'Visible evidence',
      data: expectedData,
    });
  });

  it('parses optional errors without discarding valid data', () => {
    const response = `<errors>["target is not visible"]</errors><seed:tool_call><function name="extract_data"><parameter name="data" string="true">null</parameter></function></seed:tool_call>`;

    expect(parseDoubaoInsightResponse(response)).toEqual({
      data: null,
      errors: ['target is not visible'],
    });
  });

  it('throws when the required data parameter is missing', () => {
    expect(() =>
      parseDoubaoInsightResponse(
        '<seed:tool_call><function name="extract_data"></function></seed:tool_call>',
      ),
    ).toThrow('Missing required Seed parameter: data');
  });
});
