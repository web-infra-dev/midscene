import { PlaygroundConversationPanel } from '@midscene/playground-app';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import {
  IncutPlaygroundShell,
  incutPlaygroundImportAssets,
} from '../IncutPlaygroundImport';

declare const __APP_VERSION__: string;

export default function Playground() {
  const studioPlayground = useStudioPlayground();

  return (
    <IncutPlaygroundShell>
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-black/60">
            Android playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-[14px] leading-[22px] text-black/70">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-[#ECECEC] px-4 py-2 text-[13px] font-medium text-black/90"
              onClick={() => {
                void studioPlayground.restartAndroidPlayground();
              }}
              type="button"
            >
              Retry Android runtime
            </button>
          </div>
        ) : (
          <PlaygroundConversationPanel
            appVersion={__APP_VERSION__}
            className="h-full"
            controller={studioPlayground.controller}
            playgroundConfig={{
              promptInputChrome: {
                variant: 'incut',
                placeholder: 'Type a message',
                primaryActionLabel: 'Action',
                icons: {
                  action: incutPlaygroundImportAssets.main.action,
                  actionChevron: incutPlaygroundImportAssets.main.actionChevron,
                  history: undefined,
                  send: incutPlaygroundImportAssets.main.actionChevron,
                  settings: incutPlaygroundImportAssets.main.tool,
                },
              },
              showEnvConfigReminder: false,
              showVersionInfo: false,
            }}
            title="Android Playground"
          />
        )}
      </div>
    </IncutPlaygroundShell>
  );
}
