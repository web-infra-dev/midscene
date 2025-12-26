import { agentFromAdbDevice } from '@midscene/android';
import { getMidsceneRunDir } from '@midscene/shared';

type FormattedMidsceneResult =
  | {
      code: 1;
      data: { report: string; rawInfo: any };
    }
  | { code: 0; data: { reason: string } };

function formatResult(result: any) {
  const header = '___ANDROID_WORLD_RESULT_START___';
  const footer = '___ANDROID_WORLD_RESULT_END___';
  return `${header}\n${JSON.stringify(result, null, 2)}\n${footer}`;
}

async function runMidscene(
  deviceId: string = process.env.TARGET_DEVICE_ID || '',
) {
  if (!deviceId) {
    throw new Error('deviceId is required');
  }
  const agent = await agentFromAdbDevice(deviceId);
  const goalInput = process.argv?.[2] || '';
  const targetGoal =
    goalInput?.replace('--goal=', '') || process.env.TARGET_GOAL || '';
  if (!targetGoal) {
    throw new Error('goal is required');
  }

  let result: FormattedMidsceneResult = {
    code: 0,
    data: { reason: 'unknown' },
  };

  try {
    const rawInfo = await agent.ai(targetGoal);
    result = {
      code: 1,
      data: {
        rawInfo,
        report: getMidsceneRunDir() + agent.reportFileName,
      },
    };
  } catch (e: unknown) {
    result = {
      code: 0,
      data: { reason: (e as Error).message },
    };
  }
  console.log(formatResult(result));
  return result;
}

runMidscene();
