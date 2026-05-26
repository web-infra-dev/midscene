import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StudioPlaygroundEmptyState } from '../src/renderer/components/Playground/StudioPlaygroundEmptyState';

describe('StudioPlaygroundEmptyState', () => {
  it('renders the imported empty chat content', () => {
    const html = renderToStaticMarkup(
      createElement(StudioPlaygroundEmptyState),
    );

    expect(html).toContain('studio-playground-empty-state-logo');
    expect(html).toContain('Welcome to');
    expect(html).toContain('Midscene.js Playground!');
    expect(html).toContain(
      'This is a panel for experimenting and testing Midscene.js features.',
    );
    expect(html).toContain(
      'You can use natural language instructions to operate the web page',
    );
    expect(html).toContain(
      'Please enter your instructions in the input box below',
    );
  });
});
