/** CLI-only interception. SDK consumers never have their streams patched. */
export function captureTerminalOutput(
  output: (message: string, write: (message: string) => void) => void,
  streams: readonly Pick<NodeJS.WriteStream, 'write'>[] = [
    process.stdout,
    process.stderr,
  ],
): () => void {
  const cleanups: (() => void)[] = [];
  for (const stream of streams) {
    const original = stream.write;
    const forward = original.bind(stream);
    const intercepted: typeof stream.write = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error) => void),
      callback?: (error?: Error) => void,
    ): boolean => {
      const done = typeof encoding === 'function' ? encoding : callback;
      const message =
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      let accepted = true;
      output(message, (text) => {
        accepted = forward(text, done);
      });
      return accepted;
    };
    stream.write = intercepted;
    cleanups.push(() => {
      if (stream.write === intercepted) stream.write = original;
    });
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
