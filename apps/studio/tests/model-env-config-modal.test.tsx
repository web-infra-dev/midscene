import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelEnvConfigModal } from '../src/renderer/components/ShellLayout/ModelEnvConfigModal';

describe('ModelEnvConfigModal', () => {
  it('renders the text editor without soft wrapping', () => {
    const html = renderToStaticMarkup(
      createElement(ModelEnvConfigModal, {
        onClose: () => undefined,
        open: true,
        textValue: 'OPENAI_API_KEY=sk-example',
      }),
    );

    expect(html).toContain('wrap="off"');
  });
});
