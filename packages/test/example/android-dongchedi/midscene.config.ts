import { readFileSync } from 'node:fs';
import { type AndroidAgent, agentFromAdbDevice } from '@midscene/android';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';

interface DongchediProjectContext {
  agent: AndroidAgent;
}

const pageNavigationContext = readFileSync(
  new URL('./app-context/page-navigation.md', import.meta.url),
  'utf8',
);

const rankingComponentsContext = readFileSync(
  new URL('./app-context/ranking-components.md', import.meta.url),
  'utf8',
);

const currentMonthParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
}).formatToParts(new Date());
const currentYear = Number(
  currentMonthParts.find((part) => part.type === 'year')?.value,
);
const currentMonth = Number(
  currentMonthParts.find((part) => part.type === 'month')?.value,
);

function monthLabel(offset: number): string {
  const target = new Date(Date.UTC(currentYear, currentMonth - 1 + offset, 1));
  return `${target.getUTCFullYear()}年${target.getUTCMonth() + 1}月`;
}

const rankingTimeContext = `## 当前年月

- 当前是 ${monthLabel(0)}。
- “上个月月份”是 ${monthLabel(-1)}。
- “上上个月月份”是 ${monthLabel(-2)}。
- 选择榜单时间时严格使用以上对应关系，不要自行推测其他月份。`;

const rankingActionContext = `${pageNavigationContext}

${rankingComponentsContext}

${rankingTimeContext}`;

const androidSetup = defineProjectSetup<DongchediProjectContext>({
  name: 'dongchedi-adb',
  platform: 'android',
  async setup({ onTeardown }) {
    const deviceId = process.env.ANDROID_DEVICE_ID?.trim() || undefined;
    const agent = await agentFromAdbDevice(deviceId, {
      contexts: {
        aiAct: rankingActionContext,
      },
      screenshotShrinkFactor: 2,
    });

    onTeardown(async () => {
      await agent.destroy();
    });

    return { agent };
  },
});

const midsceneNodes = createMidsceneNodes<DongchediProjectContext>({
  getAgent: ({ context }) => context.agent,
});

export default defineTestProject<DongchediProjectContext>({
  projects: [
    {
      name: 'dongchedi-android',
      platform: 'android',
      setup: androidSetup,
      files: {
        include: ['test-runner/**/*.{yaml,yml}'],
        exclude: ['test-runner/**/*.draft.{yaml,yml}'],
      },
      retry: 0,
      variables: {
        appUri: process.env.DONGCHEDI_PACKAGE?.trim() || 'com.ss.android.auto',
        rankingTimeContext,
      },
    },
  ],
  nodes: [...midsceneNodes],
  test: {
    maxConcurrency: 1,
    bail: 0,
    testTimeout: 1_200_000,
  },
  output: {
    reportDir: './midscene_run/report',
  },
});
