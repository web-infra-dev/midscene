import { PlaygroundConversationPanel } from '@midscene/playground-app';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { PlaygroundShell, playgroundShellAssets } from '../PlaygroundShell';

declare const __APP_VERSION__: string;

export default function Playground() {
  const studioPlayground = useStudioPlayground();
  const { promptInputIcons } = playgroundShellAssets;

  return (
    <PlaygroundShell>
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-text-tertiary">
            Android playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-[14px] leading-[22px] text-text-secondary">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary"
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
                variant: 'minimal',
                placeholder: 'Type a message',
                primaryActionLabel: 'Action',
                icons: {
                  action: promptInputIcons.action,
                  actionChevron: promptInputIcons.actionChevron,
                  send: promptInputIcons.actionChevron,
                  settings: promptInputIcons.tool,
                },
              },
              showClearButton: false,
              showSystemMessageHeader: false,
              enableScrollToBottom: false,
              showEnvConfigReminder: false,
              showVersionInfo: false,
            }}
            title="Android Playground"
          />
        )}
      </div>
    </PlaygroundShell>
  );
}
