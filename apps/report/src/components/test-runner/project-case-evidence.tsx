import { type ReactNode, createElement } from 'react';

export function ProjectCaseEvidence({
  frameCount,
  children,
}: {
  frameCount: number;
  children?: ReactNode;
}): JSX.Element {
  return createElement(
    'details',
    { className: 'runner-project-case-evidence' },
    createElement(
      'summary',
      null,
      'Execution evidence ',
      createElement(
        'span',
        null,
        `${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}`,
      ),
    ),
    children,
  );
}
