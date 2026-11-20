import { useEffect, useState } from 'react';
import { ShowcaseStage } from './components/ShowcaseStage';
import { I18nProvider, type Locale } from './i18n/translations';
import './overview.css';

export function UniversalDeviceTags() {
  return (
    <ul className="universal-device-tags rp-not-doc">
      <li>Universal Device</li>
      <li>E2E Testing</li>
      <li>Open Protocol</li>
      <li>MCP &amp; Skills</li>
    </ul>
  );
}

export function UniversalDeviceOverview({ locale }: { locale: Locale }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <I18nProvider locale={locale}>
      <div className="universal-device-overview">
        {mounted && <ShowcaseStage />}
      </div>
    </I18nProvider>
  );
}
