export function normalizeReportCommandArgs(rawArgs: string[]): string[] {
  const [commandName, reportPath, ...restArgs] = rawArgs;
  if (
    commandName?.toLowerCase() !== 'analyze' ||
    !reportPath ||
    reportPath.startsWith('--')
  ) {
    return rawArgs;
  }

  return [commandName, '--htmlPath', reportPath, ...restArgs];
}
