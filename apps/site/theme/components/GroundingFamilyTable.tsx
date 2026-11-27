import { families as presetFamilies } from '../../../../packages/cli/src/benchmark-grounding/presets/metadata.json';
import {
  GroundingMetricBadge,
  GroundingTableLabel,
} from './GroundingMetricBadge';

type FamilyRow = { name: keyof typeof presetFamilies } & (
  | { winners: [string, string, string, string] }
  | { onlyModel: string }
);

const families: FamilyRow[] = [
  {
    name: 'Gemini',
    winners: [
      'gemini-4-hydrogen',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.8-flash',
    ],
  },
  {
    name: 'GPT',
    winners: ['gpt-6.2-sol', 'gpt-5.6-luna', 'gpt-6-luna', 'gpt-6-luna'],
  },
  {
    name: 'Qwen',
    winners: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-flash', 'qwen3.7-plus'],
  },
  {
    name: 'Hunyuan',
    winners: ['hy4', 'hy4-flash', 'hy4-flash', 'hy4-flash'],
  },
  {
    name: 'Kimi',
    winners: ['kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3'],
  },
  {
    name: 'Doubao',
    winners: [
      'seed-evolving',
      'seed-2.0-mini',
      'seed-2.0-mini',
      'seed-2.1-lite',
    ],
  },
  {
    name: 'StepFun',
    onlyModel: 'step-3.7-flash',
  },
  {
    name: 'MiMo',
    onlyModel: 'mimo-v2.6-flash',
  },
  {
    name: 'DeepSeek',
    onlyModel: 'deepseek-v4.1-flash',
  },
  {
    name: 'Jev',
    onlyModel: 'jev-1.14',
  },
];

const familyLabels = { zh: '模型家族', en: 'Model family' } as const;
const metrics = [
  { label: 'Accuracy', badge: 'accuracy' },
  { label: 'Performance', badge: 'performance' },
  { label: 'Economy', badge: 'economy' },
  { label: 'Balance', badge: 'balance' },
] as const;

type Locale = keyof typeof familyLabels;

export function GroundingFamilyTable({ locale }: { locale: Locale }) {
  return (
    <div className="rp-table-scroll-container rp-scrollbar">
      <table className="grounding-family-table">
        <thead>
          <tr>
            <th scope="col">{familyLabels[locale]}</th>
            {metrics.map(({ label, badge }) => (
              <th key={label} scope="col">
                <GroundingMetricBadge metric={badge}>
                  {label}
                </GroundingMetricBadge>
                {'\u00a0'}
                <sup lang="en">top1</sup>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {families.map((family) => {
            const style = presetFamilies[family.name];
            const logo = 'logo' in style ? style.logo : undefined;
            const winners =
              'winners' in family
                ? family.winners
                : metrics.map(() => family.onlyModel);
            return (
              <tr key={family.name}>
                <td>
                  <strong>
                    <GroundingTableLabel icon={logo}>
                      {family.name}
                    </GroundingTableLabel>
                  </strong>
                </td>
                {'onlyModel' in family && !import.meta.env.SSG_MD ? (
                  <td colSpan={metrics.length}>
                    <code>{family.onlyModel}</code>
                  </td>
                ) : (
                  winners.map((winner, column) => (
                    <td key={metrics[column].label}>
                      <code>{winner}</code>
                    </td>
                  ))
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
