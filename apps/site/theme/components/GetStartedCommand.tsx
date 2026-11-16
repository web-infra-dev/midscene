import { CodeBlockRuntime } from '@rspress/core/theme';
import { useGetStarted } from './GetStarted';
import { testCreateCommand } from './get-started-plan';

// Kept apart from GetStarted.tsx so its unit tests do not load the Rspress theme.
export function GetStartedCreateCommand() {
  const { selection } = useGetStarted();
  return (
    <CodeBlockRuntime
      lang="bash"
      code={testCreateCommand(selection.platform)}
    />
  );
}
