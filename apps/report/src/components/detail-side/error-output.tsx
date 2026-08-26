import type { ExecutionTask } from '@midscene/core';
import React from 'react';
import { Card, CollapsibleCard } from './ui';

type TaskErrorFields = Partial<
  Pick<ExecutionTask, 'error' | 'errorMessage' | 'errorStack'>
>;

export interface TaskErrorDisplay {
  message: string;
  stack?: string;
}

export function getTaskErrorDisplay(
  task: TaskErrorFields | null | undefined,
): TaskErrorDisplay | null {
  if (!task?.error && !task?.errorMessage && !task?.errorStack) {
    return null;
  }

  const message = task.errorMessage || task.error?.message || 'Unknown error';
  const candidateStack = task.errorStack || task.error?.stack;
  const stack =
    candidateStack && !message.includes(candidateStack)
      ? candidateStack
      : undefined;

  return { message, stack };
}

export const ErrorCard = (props: {
  error: TaskErrorDisplay;
}): JSX.Element => (
  <Card
    liteMode={true}
    title="error"
    content={
      <React.Fragment>
        <pre className="description-content error-message">
          {props.error.message}
        </pre>
        {props.error.stack && (
          <CollapsibleCard
            title="technical details"
            content={props.error.stack}
          />
        )}
      </React.Fragment>
    }
  />
);
