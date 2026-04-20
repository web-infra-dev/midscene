export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode = 1,
  ) {
    super(message);
  }
}

export function reportCLIError(
  error: unknown,
  log: (
    message?: unknown,
    ...optionalParams: unknown[]
  ) => void = console.error,
): number {
  if (error instanceof CLIError) {
    log(error.message);
    return error.exitCode;
  }

  log(error);
  return 1;
}
