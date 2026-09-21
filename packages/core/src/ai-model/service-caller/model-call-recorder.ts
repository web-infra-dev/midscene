import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { getMidsceneRunBaseDir } from '@midscene/shared/common';
import { getBasicEnvValue } from '@midscene/shared/env/basic';
import { MIDSCENE_RECORD_MODEL_CALL } from '@midscene/shared/env/types';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser, ifInWorker } from '@midscene/shared/utils';

const warnRecorder = getDebug('ai:model-record', { console: true });

export function isModelCallRecordingEnabled() {
  if (ifInBrowser || ifInWorker) return false;
  const value = getBasicEnvValue(MIDSCENE_RECORD_MODEL_CALL);
  return value === 'true' || value === '1';
}

export class ModelCallRecorder {
  private readonly processStartTime = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
  private filePath: string | undefined;
  private filePathPromise: Promise<string | undefined> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  private async initializeFilePath() {
    try {
      const dir = path.join(getMidsceneRunBaseDir(), 'model-requests');
      await mkdir(dir, { recursive: true });
      this.filePath = path.join(
        dir,
        `${this.processStartTime}-${process.pid}.jsonl`,
      );
    } catch (error) {
      warnRecorder('Failed to initialize model call recorder', error);
    }
    return this.filePath;
  }

  private getFilePath(): Promise<string | undefined> {
    if (this.filePath || !isModelCallRecordingEnabled()) {
      return Promise.resolve(this.filePath);
    }

    if (!this.filePathPromise) {
      this.filePathPromise = this.initializeFilePath().finally(() => {
        this.filePathPromise = undefined;
      });
    }
    return this.filePathPromise;
  }

  private async writeEvent(event: Record<string, unknown>) {
    const filePath = await this.getFilePath();
    if (!filePath) return;
    await appendFile(
      filePath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
    );
  }

  record(event: Record<string, unknown>) {
    const nextWrite = this.writeQueue.then(() => this.writeEvent(event));
    this.writeQueue = nextWrite.catch((error) => {
      warnRecorder('Failed to write model call record', error);
    });
    return this.writeQueue;
  }
}

const modelCallRecorder = new ModelCallRecorder();

export function recordModelCallEvent(event: Record<string, unknown>) {
  return modelCallRecorder.record(event);
}
