import { StringDecoder } from 'node:string_decoder';

/** CLI-only interception. SDK consumers never have their streams patched. */
export function captureTerminalOutput(
  output: (message: string, write: (message: string) => void) => void,
  streams: readonly Pick<NodeJS.WritableStream, 'write'>[] = [
    process.stdout,
    process.stderr,
  ],
): () => void {
  const cleanups: (() => void)[] = [];
  for (const stream of streams) {
    const original = stream.write;
    const forward = original.bind(stream);
    const decoder = new StringDecoder('utf8');
    const intercepted: typeof stream.write = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean => {
      const done = typeof encoding === 'function' ? encoding : callback;
      const bytes =
        typeof chunk === 'string'
          ? Buffer.from(
              chunk,
              typeof encoding === 'string' ? encoding : undefined,
            )
          : chunk;
      const message = decoder.write(bytes);
      if (message.length === 0) return forward('', done);
      let accepted = true;
      output(message, (text) => {
        accepted = forward(text, done);
      });
      return accepted;
    };
    stream.write = intercepted;
    cleanups.push(() => {
      if (stream.write !== intercepted) return;
      stream.write = original;
      const remaining = decoder.end();
      if (remaining) forward(remaining);
    });
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
