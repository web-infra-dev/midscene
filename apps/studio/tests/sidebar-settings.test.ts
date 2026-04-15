import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsDock from '../src/renderer/components/SettingsDock';
import SettingsPanel from '../src/renderer/components/SettingsPanel';

describe('studio sidebar settings entrypoints', () => {
  it('renders only a single Env quick action in the bottom dock', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsDock, {
        onEnvClick: () => undefined,
        onToggleSettings: () => undefined,
        settingsOpen: false,
      }),
    );

    expect(html).toContain('Env');
    expect(html).not.toContain('Model');
  });

  it('keeps Environment in the settings panel and removes the duplicate Model row', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsPanel, {
        onEnvConfigClick: () => undefined,
      }),
    );

    expect(html).toContain('Environment');
    expect(html).not.toContain('Model');
  });
});
