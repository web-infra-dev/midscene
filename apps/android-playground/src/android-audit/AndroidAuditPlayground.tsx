import { PlaygroundApp } from '@midscene/playground-app';
import { useState } from 'react';
import { AndroidAuditProvider } from './AndroidAuditContext';
import { AndroidAuditInspector } from './AndroidAuditInspector';
import { AndroidAuditOverlay } from './AndroidAuditOverlay';

declare const __APP_VERSION__: string;

function AndroidPlaygroundContent({ serverUrl }: { serverUrl: string }) {
  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="android-playground-shell">
      <PlaygroundApp
        appVersion={__APP_VERSION__}
        branding={{ title: 'Android Playground', targetName: 'android' }}
        defaultDeviceType="android"
        inspectorOpen={auditOpen}
        manualPreviewInteractionEnabled={!auditOpen}
        offlineTitle="Midscene Android Playground"
        renderHeaderActions={() => (
          <button
            aria-label={auditOpen ? 'Close XPath Audit' : 'Open XPath Audit'}
            aria-pressed={auditOpen}
            className={`android-audit-nav-button${auditOpen ? ' active' : ''}`}
            onClick={() => setAuditOpen((open) => !open)}
            title={auditOpen ? 'Close XPath Audit' : 'Open XPath Audit'}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16">
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" />
              <circle cx="8" cy="8" r="3.5" />
              <circle cx="8" cy="8" r="1" />
            </svg>
          </button>
        )}
        renderInspector={() => <AndroidAuditInspector />}
        renderPreviewOverlay={
          auditOpen
            ? (context) => <AndroidAuditOverlay {...context} />
            : undefined
        }
        serverUrl={serverUrl}
        title="Android Playground"
      />
    </div>
  );
}

export function AndroidAuditPlayground() {
  const serverUrl = window.location.origin;
  return (
    <AndroidAuditProvider serverUrl={serverUrl}>
      <AndroidPlaygroundContent serverUrl={serverUrl} />
    </AndroidAuditProvider>
  );
}
