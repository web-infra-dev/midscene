import path from 'node:path';
import { casesDir } from '../runtime/paths.js';
import type { CaseRecord, StoredModelRecord } from '../types.js';
import type {
  MidsceneEvaluationPlan,
  MidsceneEvaluationPlanItem,
  MidsceneRunConfig,
} from './types.js';

function resolveCasePrompt(input: {
  caseRecord: CaseRecord;
  promptSource: MidsceneRunConfig['selection']['promptSource'];
}): { prompt: string; promptType: 'primary' | 'fallback' } {
  const { caseRecord, promptSource } = input;

  if (promptSource === 'fallback' && caseRecord.fallbackPrompt.trim()) {
    return {
      prompt: caseRecord.fallbackPrompt.trim(),
      promptType: 'fallback',
    };
  }

  return {
    prompt: caseRecord.prompt,
    promptType: 'primary',
  };
}

export function buildMidsceneEvaluationPlan(input: {
  runConfig: MidsceneRunConfig;
  models: StoredModelRecord[];
  cases: CaseRecord[];
}): MidsceneEvaluationPlan {
  const { runConfig, models, cases } = input;
  const selectedModels = models.filter((model) =>
    runConfig.selection.modelIds.includes(model.id),
  );

  if (
    selectedModels.length !== runConfig.selection.modelIds.length ||
    selectedModels.length === 0
  ) {
    throw new Error('Some selected model IDs were not found');
  }

  const selectedCaseNames =
    runConfig.selection.caseNames.length > 0
      ? runConfig.selection.caseNames
      : cases.map((item) => item.caseName);
  const filteredCaseNames = selectedCaseNames.filter(
    (caseName) => !runConfig.selection.excludeCaseNames.includes(caseName),
  );
  if (new Set(filteredCaseNames).size !== filteredCaseNames.length) {
    throw new Error('Midscene run-config 中的用例名不能重复');
  }
  const availableCaseNames = new Set(cases.map((item) => item.caseName));
  const missingCaseNames = filteredCaseNames.filter(
    (caseName) => !availableCaseNames.has(caseName),
  );
  if (missingCaseNames.length > 0) {
    throw new Error(
      `Midscene run-config 中有 ${missingCaseNames.length} 个未找到的用例：${missingCaseNames.slice(0, 5).join(', ')}`,
    );
  }

  const selectedCases = cases.filter((caseItem) =>
    filteredCaseNames.includes(caseItem.caseName),
  );
  if (selectedCases.length === 0) {
    throw new Error('Midscene run-config 中未匹配到任何用例');
  }
  if (
    runConfig.locate.implementation !== 'aiLocate' &&
    selectedCases.some((caseItem) =>
      caseItem.images.some((image) => image.expectedOutcome === 'refusal'),
    )
  ) {
    throw new Error('Refusal 用例需要 aiLocate；aiAct 当前无法判定明确未定位');
  }

  const items: MidsceneEvaluationPlanItem[] = [];

  for (const model of selectedModels) {
    for (const caseRecord of selectedCases) {
      const { prompt, promptType } = resolveCasePrompt({
        caseRecord,
        promptSource: runConfig.selection.promptSource,
      });
      const matchedImages = caseRecord.images.filter((image) =>
        runConfig.selection.imageTypes.includes(image.imageType),
      );

      if (!matchedImages.length)
        throw new Error(`No selected image type in ${caseRecord.caseName}`);
      for (
        let iteration = 1;
        iteration <= runConfig.execution.iterations;
        iteration++
      ) {
        for (const image of matchedImages) {
          items.push({
            id: `${model.id}:${caseRecord.caseName}:${image.fileName}:${iteration}`,
            model,
            caseRecord,
            caseName: caseRecord.caseName,
            prompt,
            promptType,
            imageType: image.imageType,
            imageFileName: image.fileName,
            screenshotPath: path.join(
              casesDir,
              caseRecord.caseName,
              image.fileName,
            ),
            gtBox: image.gtBox,
            expectedOutcome:
              image.expectedOutcome === 'refusal' ? 'refusal' : 'point',
            iteration,
            deepLocate: runConfig.locate.useDeepLocate,
            locateImplementation: runConfig.locate.implementation,
          });
        }
      }
    }
  }

  return {
    config: runConfig,
    items,
    selectedModels,
    selectedCases,
  };
}
