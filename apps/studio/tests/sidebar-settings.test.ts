import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SettingsDock from '../src/renderer/components/SettingsDock';
import SettingsPanel from '../src/renderer/components/SettingsPanel';
import { ThemeProvider } from '../src/renderer/theme/ThemeProvider';

describe('studio sidebar settings entrypoints', () => {
  it('renders Settings and Model Config as stacked rows in the bottom dock', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsDock, {
        onEnvClick: () => undefined,
        onToggleSettings: () => undefined,
        settingsOpen: false,
      }),
    );

    expect(html).toContain('Settings');
    expect(html).toContain('Model Config');
    expect(html).not.toContain('>Env<');
  });

  it('keeps the settings panel focused on app preferences without a model config row', () => {
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, null, createElement(SettingsPanel, {})),
    );

    // Language is intentionally hidden until i18n ships (storage hook
    // still runs in the background).
    expect(html).not.toContain('Language');
    expect(html).toContain('Theme');
    expect(html).toContain('GitHub');
    expect(html).toContain('Website');
    expect(html).not.toContain('Environment');
    expect(html).not.toContain('Model Config');
  });
});
