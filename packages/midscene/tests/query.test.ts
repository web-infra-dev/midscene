/* eslint-disable @typescript-eslint/no-implied-eval */
import { describe, it } from 'vitest';
import { pageScriptToGetTexts } from '@/query';

describe('query', () => {
  it('make sure scripts are valid', () => {
    const allScripts = pageScriptToGetTexts();
    new Function(allScripts);

    const scriptsForSelector = pageScriptToGetTexts('#id');
    new Function(scriptsForSelector);
  });
});
