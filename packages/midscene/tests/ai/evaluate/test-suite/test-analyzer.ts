import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MIDSCENE_MODEL_NAME } from '@/ai-model/openai';
import { writeFileSyncWithDir } from './util';

export class TestResultAnalyzer {
  private successCount = 0;
  private failCount = 0;
  private repeatIndex = 0;
  private modelName = process.env[MIDSCENE_MODEL_NAME];
  private updateAiData = Boolean(process.env.UPDATE_AI_DATA);
  private successResults: {
    index: number;
    response: any[];
    prompt: string;
  }[] = [];
  private failResults: {
    index: number;
    expected: any[];
    actual: any[];
    prompt: string;
  }[] = [];
  private totalTime = 0;

  constructor(
    private aiDataPath: string,
    private aiData: any,
    private aiResponse: any[],
    repeatIndex: number,
  ) {
    this.repeatIndex = repeatIndex;
  }

  analyze() {
    this.aiData.testCases.forEach((testCase: any, index: number) => {
      const result = this.aiResponse[index];
      this.totalTime += result.spendTime;
      this.compareResult(testCase, result, index);
    });

    const resultData = this.generateResultData();

    if (this.updateAiData) {
      writeFileSync(
        this.aiDataPath,
        JSON.stringify(this.aiData, null, 2),
        'utf-8',
      );
    }

    writeFileSyncWithDir(
      path.join(
        __dirname,
        `__ai_responses__/${this.modelName}/${this.aiDataPath.split('/').pop()?.replace('.json', '')}-${this.repeatIndex}-inspector-element-result.json`,
      ),
      JSON.stringify(resultData, null, 2),
      { encoding: 'utf-8' },
    );

    return resultData;
  }

  private compareResult(testCase: any, result: any, index: number) {
    const resultElements = result.elements.map((element: any) => ({
      id: element.id,
    }));
    if (JSON.stringify(resultElements) === JSON.stringify(testCase.response)) {
      this.handleSuccess(result, testCase, index);
    } else {
      this.handleFailure(result, testCase, index);
    }
  }

  private handleSuccess(result: any, testCase: any, index: number) {
    this.successCount++;
    this.successResults.push({
      index,
      response: result.elements,
      prompt: testCase.prompt,
    });
  }

  private handleFailure(result: any, testCase: any, index: number) {
    this.failCount++;
    this.failResults.push({
      index,
      expected: testCase.elements,
      actual: result.elements.map((element: any) => ({ id: element.id })),
      prompt: result.prompt,
    });

    if (this.updateAiData) {
      testCase.elements = result.elements.map((element: any) => ({
        id: element.id,
      }));
    }
  }

  private generateResultData() {
    const totalCount = this.successCount + this.failCount;
    const score = (this.successCount / totalCount) * 100;
    const averageTime = this.totalTime / totalCount;

    return {
      model: this.modelName,
      score,
      averageTime: `${(averageTime / 1000).toFixed(2)}s`,
      successCount: this.successCount,
      failCount: this.failCount,
      successResults: this.successResults,
      failResults: this.failResults,
      aiResponse: this.aiResponse,
    };
  }
}

const aggregatedResultsPath = path.join(
  __dirname,
  `__ai_responses__/${process.env[MIDSCENE_MODEL_NAME]}/aggregated-results.json`,
);

// Function to delete the aggregated results file
function deleteAggregatedResultsFile() {
  try {
    unlinkSync(aggregatedResultsPath);
    console.log(`Successfully deleted ${aggregatedResultsPath}`);
  } catch (error) {
    // console.error(`Error deleting ${aggregatedResultsPath}:`, error);
  }
}

// Call the function to delete the file
deleteAggregatedResultsFile();

export function updateAggregatedResults(source: string, resultData: any) {
  // Read existing aggregated results or initialize new object
  let aggregatedResults;
  try {
    aggregatedResults = JSON.parse(
      readFileSync(aggregatedResultsPath, 'utf-8'),
    );
  } catch (error) {
    aggregatedResults = {};
  }

  // Update aggregated results
  aggregatedResults.model = process.env[MIDSCENE_MODEL_NAME];
  if (!aggregatedResults[source]) {
    aggregatedResults[source] = {
      totalScore: 0,
      totalTime: 0,
      totalSuccessCount: 0,
      totalFailCount: 0,
      count: 0,
      repeatTime: 0,
    };
  }
  // Calculate averages
  const data = aggregatedResults[source];
  data.totalScore += resultData.score || 0;
  data.totalTime +=
    Number.parseFloat(resultData.averageTime.replace('s', '')) || 0;
  data.totalSuccessCount += resultData.successCount || 0;
  data.totalFailCount += resultData.failCount || 0;
  data.count++;
  data.repeatTime++;
  const totalTests = data.totalSuccessCount + data.totalFailCount;
  const aggregatedResultsJson = {
    ...aggregatedResults,
    [source]: {
      totalScore: data.totalScore,
      totalTime: Number.parseFloat(data.totalTime),
      totalSuccessCount: data.totalSuccessCount,
      totalFailCount: data.totalFailCount,
      count: data.count,
      repeatTime: data.repeatTime,
      averageScore: (data.totalScore / data.count).toFixed(2),
      averageTime: `${(data.totalTime / data.count).toFixed(2)}s`,
      successRate:
        totalTests === 0
          ? '0.00%'
          : `${((data.totalSuccessCount / totalTests) * 100).toFixed(2)}%`,
      failRate:
        totalTests === 0
          ? '0.00%'
          : `${((data.totalFailCount / totalTests) * 100).toFixed(2)}%`,
    },
  };

  // Write updated results to JSON file
  writeFileSync(
    aggregatedResultsPath,
    JSON.stringify(aggregatedResultsJson, null, 2),
  );
}
