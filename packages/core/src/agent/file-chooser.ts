import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AbstractInterface, FileChooserHandler } from '@/device';
import { ifInBrowser } from '@midscene/shared/utils';

export type FileChooserAccept = string | string[];

export function normalizeFileChooserAccept(
  files: FileChooserAccept,
): string[] {
  const filesArray = Array.isArray(files) ? files : [files];

  if (ifInBrowser) {
    throw new Error('File chooser is not supported in browser environment');
  }

  return filesArray.map((file) => {
    const absolutePath = resolve(file);
    if (!existsSync(absolutePath)) {
      throw new Error(
        `File not found: ${file}. Resolved to: ${absolutePath}. Current working directory: ${process.cwd()}`,
      );
    }
    return absolutePath;
  });
}

export async function withFileChooser<T>(
  interfaceInstance: AbstractInterface,
  fileChooserAccept: string[] | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (!fileChooserAccept?.length) {
    return action();
  }

  if (!interfaceInstance.registerFileChooserListener) {
    throw new Error(
      `File upload is not supported on ${interfaceInstance.interfaceType}`,
    );
  }

  const handler = async (chooser: FileChooserHandler) => {
    await chooser.accept(fileChooserAccept);
  };

  const { dispose, getError } =
    await interfaceInstance.registerFileChooserListener(handler);
  try {
    const result = await action();
    const error = getError();
    if (error) {
      throw error;
    }
    return result;
  } finally {
    dispose();
  }
}
