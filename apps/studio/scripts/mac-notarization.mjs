import { notarize } from '@electron/notarize';
import { isTransientMacNetworkError, runMacStapler } from './mac-stapler.mjs';

export const notarizeMacArtifact = async (
  options,
  { submit = notarize, staple = runMacStapler } = {},
) => {
  try {
    await submit(options);
  } catch (error) {
    // @electron/notarize 3.1.1 throws this only after notarytool has accepted
    // the artifact and its internal stapler command failed. Its promise-retry
    // callback does not request retries, so recover that phase ourselves.
    // Submission/authorization failures must propagate without resubmission.
    if (
      !(error instanceof Error) ||
      !error.message.startsWith(
        'Failed to staple your application with code:',
      ) ||
      !isTransientMacNetworkError(error.message)
    ) {
      throw error;
    }

    console.error(error.message);
    console.log(
      `Notarization accepted for ${options.appPath}; retrying ticket stapling without resubmitting the artifact.`,
    );
    await staple('staple', options.appPath);
  }

  await staple('validate', options.appPath);
};
