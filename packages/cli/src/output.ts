export interface CommandResult {
  success: boolean;
  message?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
}

export function printResult(result: CommandResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
