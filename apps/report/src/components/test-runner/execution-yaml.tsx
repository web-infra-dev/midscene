import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  MinusCircleOutlined,
  WarningFilled,
} from '@ant-design/icons';
import type { TestRunReportStep } from '@midscene/core';
import { useMemo } from 'react';
import type { ReportIssues } from './issues';
import { getStepDisplayName, isStepTimeout } from './model';
import { buildYamlSource } from './yaml-source';

export function ExecutionYaml({
  source,
  steps,
  caseIndex,
  issues,
  onSelect,
}: {
  source: string;
  steps: readonly TestRunReportStep[];
  caseIndex: number;
  issues?: ReportIssues['nodes'];
  onSelect(step: TestRunReportStep): void;
}) {
  const { lines, valid } = useMemo(
    () => buildYamlSource(source, steps, caseIndex),
    [source, steps, caseIndex],
  );
  const status = (step: TestRunReportStep) =>
    isStepTimeout(step)
      ? { label: 'Timeout', tone: 'timeout', icon: <ClockCircleOutlined /> }
      : step.status === 'success'
        ? { label: 'Success', tone: 'success', icon: <CheckCircleFilled /> }
        : step.status === 'failed'
          ? { label: 'Failed', tone: 'failed', icon: <CloseCircleFilled /> }
          : {
              label: 'Not run',
              tone: 'not-run',
              icon: <MinusCircleOutlined />,
            };
  const label = (step: TestRunReportStep) =>
    `${status(step).label}: ${getStepDisplayName(step)}. View step details`;
  return (
    <>
      {!valid ? (
        <p>
          Step markers are unavailable because the captured YAML is incomplete
          or invalid.
        </p>
      ) : null}
      <pre className="runner-yaml-code">
        <code>
          {lines.map((line) => (
            <span className="runner-yaml-line" key={line.number}>
              <span className="runner-yaml-number" aria-hidden="true">
                {line.number}
              </span>
              <span className="runner-yaml-markers">
                {line.tokens.flatMap(({ step }) => {
                  if (!step) return [];
                  const warning = issues
                    ?.get(step.id)
                    ?.some((issue) => issue.severity === 'warning');
                  const meta = status(step);
                  const description = `${label(step)}${warning ? ' (with warnings)' : ''}`;
                  return [
                    <button
                      key={step.id}
                      type="button"
                      className={`runner-yaml-marker is-${meta.tone}`}
                      aria-label={description}
                      title={description}
                      onClick={() => onSelect(step)}
                    >
                      {meta.icon}
                      {warning ? (
                        <WarningFilled className="runner-step-warning" />
                      ) : null}
                    </button>,
                  ];
                })}
              </span>
              <span className="runner-yaml-source">
                {line.tokens.map((token, index) =>
                  token.step ? (
                    <button
                      type="button"
                      key={index}
                      className="runner-yaml-step-key"
                      aria-label={label(token.step)}
                      title={label(token.step)}
                      onClick={() => onSelect(token.step!)}
                    >
                      {token.text}
                    </button>
                  ) : (
                    <span
                      key={index}
                      className={
                        token.kind ? `runner-yaml-${token.kind}` : undefined
                      }
                    >
                      {token.text}
                    </span>
                  ),
                )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </>
  );
}
