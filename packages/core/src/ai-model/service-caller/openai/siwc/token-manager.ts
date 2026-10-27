import { getCredentialStorage } from './credential-storage';
import { refreshSiwcCredentials } from './refresh';

class SiwcTokenManager {
  private pendingRefresh?: Promise<string>;

  async getAccessToken(): Promise<string> {
    const storage = await getCredentialStorage();
    const record = await storage.read();
    // Some CI machines have incorrect system clocks. Let the server reject
    // expired tokens instead of comparing expires_at against local time.
    return record.credentials.access_token;
  }

  /** Only refresh operations are shared; ordinary reads remain independent. */
  refreshAccessToken(previousAccessToken: string): Promise<string> {
    this.pendingRefresh ??= this.refreshAndSave(previousAccessToken).finally(
      () => {
        this.pendingRefresh = undefined;
      },
    );
    return this.pendingRefresh;
  }

  private async refreshAndSave(previousAccessToken: string): Promise<string> {
    // Re-read after acquiring the refresh slot: another caller may have saved
    // a new token since this request first read its credentials.
    const storage = await getCredentialStorage();
    const record = await storage.read();
    const saved = record.credentials;
    if (saved.access_token !== previousAccessToken) {
      return saved.access_token;
    }
    try {
      const credentials = await refreshSiwcCredentials(
        saved,
        AbortSignal.timeout(30_000),
      );
      await storage.save({
        ...record,
        updated_at: new Date().toISOString(),
        credentials,
      });
      return credentials.access_token;
    } catch (cause) {
      throw new Error(
        `Unable to refresh SIWC credentials: ${cause instanceof Error ? cause.message : String(cause)} ${storage.reauthorizationHint}`,
        { cause },
      );
    }
  }
}

export const siwcTokenManager = new SiwcTokenManager();
