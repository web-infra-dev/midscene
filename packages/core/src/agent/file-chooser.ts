import type { AbstractInterface, FileChooserHandler } from '@/device';
import { normalizeFilePaths } from './utils';

export type FileChooserAccept = string | string[];

export function normalizeFileChooserAccept(files: FileChooserAccept): string[] {
  const filesArray = Array.isArray(files) ? files : [files];
  return normalizeFilePaths(filesArray);
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
    const error = await getError();
    if (error) {
      throw error;
    }
    return result;
  } finally {
    dispose();
  }
}
