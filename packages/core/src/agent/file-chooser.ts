import { isAbsolute, relative, resolve, sep } from 'node:path';
import type {
  AbstractInterface,
  FileChooserHandler,
  FileChooserRegistration,
} from '@/device';
import { normalizeFilePaths } from './utils';

export type FileChooserAccept = string | string[];

export function normalizeFileChooserAccept(files: FileChooserAccept): string[] {
  const filesArray = Array.isArray(files) ? files : [files];
  return normalizeFilePaths(filesArray);
}

export function normalizeFileChooserAcceptInAllowedDir(
  files: FileChooserAccept,
  allowedDir: string,
): string[] {
  const absoluteAllowedDir = resolve(allowedDir);
  const filesArray = Array.isArray(files) ? files : [files];
  const resolvedFiles = filesArray.map((file) => {
    const resolvedFile = resolve(absoluteAllowedDir, file);
    const relativePath = relative(absoluteAllowedDir, resolvedFile);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(
        `File chooser path must be inside the configured fileChooserAllowedDir: ${file}`,
      );
    }

    return resolvedFile;
  });

  return normalizeFilePaths(resolvedFiles);
}

/**
 * Holds the current file chooser configuration for one aiAct execution.
 * Registering new files replaces the previous configuration; callers must
 * clear the accepter when the aiAct scope ends.
 */
export class FileChooserAccepter {
  private registration?: FileChooserRegistration;

  constructor(private readonly interfaceInstance: AbstractInterface) {}

  async register(files: FileChooserAccept): Promise<void> {
    await this.replaceAcceptedFiles(normalizeFileChooserAccept(files));
  }

  async registerFromAllowedDir(
    files: FileChooserAccept,
    allowedDir: string,
  ): Promise<void> {
    await this.replaceAcceptedFiles(
      normalizeFileChooserAcceptInAllowedDir(files, allowedDir),
    );
  }

  private async replaceAcceptedFiles(acceptedFiles: string[]): Promise<void> {
    const previousRegistrationError = await this.clear();
    if (previousRegistrationError) {
      throw previousRegistrationError;
    }

    if (!this.interfaceInstance.registerFileChooserListener) {
      throw new Error(
        `File upload is not supported on ${this.interfaceInstance.interfaceType}`,
      );
    }

    this.registration =
      await this.interfaceInstance.registerFileChooserListener(
        async (chooser: FileChooserHandler) => {
          await chooser.accept(acceptedFiles);
        },
      );
  }

  async clear(): Promise<Error | undefined> {
    const registration = this.registration;
    this.registration = undefined;
    if (!registration) {
      return undefined;
    }

    try {
      return await registration.getError();
    } finally {
      registration.dispose();
    }
  }
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
