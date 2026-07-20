import type { ChatCompletionMessageParam } from '@midscene/core/ai-model';
import {
  EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA,
  type EventEvidenceUnit,
  type ScreenshotAsset,
} from '@shared/ui-knowledge-contract';

type ChatCompletionUserContent = Exclude<
  Extract<ChatCompletionMessageParam, { role: 'user' }>['content'],
  string
>;

const EVENT_OBSERVATION_EXAMPLE = {
  beforePage: '项目工作台',
  beforeComponents: [
    '页面顶部：全局导航区包含搜索输入框和创建按钮',
    '页面主内容区：项目列表以卡片网格展示，卡片包含项目名称、类型、仓库和所属团队等字段',
    '项目列表右下方：分页控件包含上一页、页码、省略号和下一页',
  ],
  afterPage: '项目工作台',
  afterComponents: [
    '页面顶部：全局导航区包含搜索输入框和创建按钮',
    '页面主内容区：项目列表显示所选分页对应的项目卡片',
    '项目列表右下方：分页控件中的所选页码处于高亮状态',
  ],
  change: '点击项目列表分页页码后，所选页码高亮，项目卡片区域更新为对应页内容',
} as const;

const EVENT_OBSERVATION_SYSTEM_PROMPT = `你是 Midscene Studio 的逐事件 UI 观察器。你一次只分析一个录制事件以及这个事件对应的一到两张截图。你的输出会交给另一个模型汇总成系统 UI 知识库，因此这一阶段必须优先保证截图信息完整，不要把页面压缩成一句摘要。

<observation_goal priority="highest">
- beforePage/beforeComponents 和 afterPage/afterComponents 分别概括对应截图中的完整页面，不得只描述操作目标或发生变化的区域。
- 每条 beforeComponents 和 afterComponents 使用“方位或区域：组件及可见内容”的简单字符串。
- 页面观察 = 页面身份 + 方位 + 组件。
- 动作观察 = change。
- 动态业务值只用于理解字段含义，不要把具体项目名、用户输入值、ID 或版本号提炼成系统规则；固定标签、按钮文案、字段名、列名和固定选项需要保留。
</observation_goal>

<frame_rules>
- before 或 target-marked-before 截图写入 beforePage/beforeComponents；after 截图写入 afterPage/afterComponents。没有对应截图时页面名写空字符串、组件写空数组。
- target-marked-before 截图中的标记框只用于理解操作目标，不是产品 UI 组件。
- 组件字段是简单字符串数组，但仍要从上到下、从左到右覆盖所有有功能意义的可见区域和组件。
- 相同组件在 before 与 after 中仍应分别描述，以便后续汇总器建立完整页面状态。
- 只记录截图可见内容，不推断屏幕外区域、后台结果或未执行能力。
</frame_rules>

<change_rules>
- change 用一句完整自然语言描述“对什么组件执行了什么操作，页面发生了什么可见变化”。
- 如果没有可确认变化，写“未观察到可确认的界面变化”；如果只有初始截图，写“显示初始页面状态”。
- 不分类变化类型，不拆分新增、移除或变化组件。
</change_rules>

<output_contract>
只输出符合下方 strict JSON Schema 的 JSON 对象，不输出 Markdown、解释或代码围栏。

Strict JSON Schema:
${JSON.stringify(EVENT_VISUAL_OBSERVATION_DRAFT_JSON_SCHEMA, null, 2)}

一个 Action 对应一个简单 JSON。形状和描述粒度示例；所有内容必须替换为当前输入截图中的真实观察：
${JSON.stringify(EVENT_OBSERVATION_EXAMPLE, null, 2)}
</output_contract>`;

export function buildEventObservationMessages(
  event: EventEvidenceUnit,
  assetById: ReadonlyMap<string, ScreenshotAsset>,
): ChatCompletionMessageParam[] {
  const content: ChatCompletionUserContent = [
    {
      type: 'text',
      text: `<event>
${JSON.stringify(event, null, 2)}
</event>

以下截图按 frameRole 顺序提供。请完整观察每张截图，然后比较动作前后的可见变化。`,
    },
  ];

  for (const ref of event.evidenceRefs) {
    const asset = assetById.get(ref.assetId);
    if (!asset) {
      throw new Error(
        `Event ${event.eventHashId} references missing screenshot ${ref.assetId}.`,
      );
    }
    content.push({
      type: 'text',
      text: `FRAME ${ref.frameRole} / ${ref.assetId}`,
    });
    content.push({
      type: 'image_url',
      image_url: { url: asset.dataUrl },
    });
  }

  content.push({
    type: 'text',
    text: '输出前确认：beforePage/beforeComponents 和 afterPage/afterComponents 已覆盖对应截图；组件数组使用“方位或区域：组件”字符串完整罗列页面；change 只描述截图可见变化。只返回简单 JSON。',
  });

  return [
    { role: 'system', content: EVENT_OBSERVATION_SYSTEM_PROMPT },
    { role: 'user', content },
  ];
}
