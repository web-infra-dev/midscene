import {
  AimOutlined,
  CheckCircleOutlined,
  EditOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  HourglassOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  SelectOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { type ReactNode, createElement } from 'react';

/**
 * Default icon mapping for an `InfoListItem.actionKind` (which is
 * `ExecutionTask.subType || ExecutionTask.type` — see
 * `packages/core/src/agent/ui-utils.ts`). Returns `null` to mean
 * "no icon for this kind"; callers should render the status glyph only.
 *
 * Hosts can override this entirely via
 * `ExecutionFlowConfig.resolveActionIcon`.
 */
export function defaultProgressActionIcon(kind: string): ReactNode | null {
  switch (kind) {
    case 'Planning':
      return createElement(ExperimentOutlined);
    case 'Locate':
    case 'Insight':
      return createElement(SearchOutlined);
    case 'Tap':
    case 'Click':
    case 'DoubleClick':
    case 'RightClick':
      return createElement(AimOutlined);
    case 'Hover':
      return createElement(SelectOutlined);
    case 'Input':
    case 'KeyboardPress':
      return createElement(EditOutlined);
    case 'Scroll':
    case 'Swipe':
    case 'PullGesture':
      return createElement(SwapOutlined);
    case 'WaitFor':
      return createElement(HourglassOutlined);
    case 'Assert':
    case 'Boolean':
      return createElement(CheckCircleOutlined);
    case 'Query':
    case 'Number':
    case 'String':
      return createElement(FileSearchOutlined);
    case 'Ask':
      return createElement(QuestionCircleOutlined);
    case 'Act':
      return createElement(PlayCircleOutlined);
    default:
      // Device-specific actions (RunAdbShell, RunWdaRequest, etc.) fall
      // through to a generic "action" glyph.
      return createElement(ThunderboltOutlined);
  }
}

/**
 * Resolve the icon for a progress action, applying the host's override
 * (if any) before falling back to the default mapping.
 */
export function resolveProgressActionIcon(
  kind: string | undefined,
  override?: (kind: string) => ReactNode | null | undefined,
): ReactNode | null {
  if (!kind) return null;
  if (override) {
    const custom = override(kind);
    if (custom !== undefined) return custom;
  }
  return defaultProgressActionIcon(kind);
}
