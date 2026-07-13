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

/**
 * Holds the current file chooser configuration for one aiAct execution.
 * Registering new files replaces the previous configuration; callers must
 * clear the accepter when the aiAct scope ends.
 */
export class FileChooserAccepter {
  private registration?: FileChooserRegistration;

  constructor(private readonly interfaceInstance: AbstractInterface) {}

  async register(files: FileChooserAccept): Promise<void> {
    const previousRegistrationError = await this.clear();
    if (previousRegistrationError) {
      throw previousRegistrationError;
    }

    if (!this.interfaceInstance.registerFileChooserListener) {
      throw new Error(
        `File upload is not supported on ${this.interfaceInstance.interfaceType}`,
      );
    }

    const acceptedFiles = normalizeFileChooserAccept(files);
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
