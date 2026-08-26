'use client';
import './index.less';

import type {
  ExecutionTaskAction,
  ExecutionTaskInsightAssertion,
  ExecutionTaskPlanning,
  ExecutionTaskPlanningApply,
} from '@midscene/core';
import { extractInsightParam, paramStr, typeStr } from '@midscene/core/agent';
import {
  fullTimeStrWithMilliseconds,
  highlightColorForType,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Tag } from 'antd';
import { isElementField, useExecutionDump } from '../store';
import { ErrorCard, getTaskErrorDisplay } from './error-output';
import {
  Card,
  CollapsibleCard,
  MetaKV,
  extractTaskImages,
  renderElementDetailBox,
} from './ui';

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const objectWithoutKeys = (
  obj: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> =>
  Object.keys(obj).reduce(
    (acc, key) => {
      if (!keys.includes(key)) {
        (acc as any)[key] = obj[key];
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );

const DetailSide = (): JSX.Element => {
  const task = useExecutionDump((store) => store.activeTask);
  const dump = useExecutionDump((store) => store.insightDump);
  const { matchedElement: elements } = dump || {};
  const reasoningContent = task?.reasoning_content;

  const aiActContextValue = (task as ExecutionTaskPlanningApply)?.param
    ?.aiActContext;

  const formatStageCostLine = (
    label: string,
    start?: number,
    end?: number,
  ): string | null => {
    if (typeof start !== 'number' || typeof end !== 'number') {
      return null;
    }

    const cost = Math.max(0, end - start);
    return `${label} +${cost}ms`;
  };

  const buildStageTimingLine = (
    label: string,
    start?: number,
    end?: number,
  ): string[] => {
    const line = formatStageCostLine(label, start, end);
    return line ? [line] : [];
  };

  const timingDetailLines = [
    ...buildStageTimingLine(
      'getUiContext',
      task?.timing?.getUiContextStart,
      task?.timing?.getUiContextEnd,
    ),
    ...buildStageTimingLine(
      'callAi',
      task?.timing?.callAiStart,
      task?.timing?.callAiEnd,
    ),
    ...buildStageTimingLine(
      'call beforeInvokeAction',
      task?.timing?.beforeInvokeActionHookStart,
      task?.timing?.beforeInvokeActionHookEnd,
    ),
    ...buildStageTimingLine(
      'call action',
      task?.timing?.callActionStart,
      task?.timing?.callActionEnd,
    ),
    ...buildStageTimingLine(
      'call afterInvokeAction',
      task?.timing?.afterInvokeActionHookStart,
      task?.timing?.afterInvokeActionHookEnd,
    ),
    ...buildStageTimingLine(
      'capture after-calling snapshot',
      task?.timing?.captureAfterCallingSnapshotStart,
      task?.timing?.captureAfterCallingSnapshotEnd,
    ),
  ];

  // Helper functions for rendering element items
  const elementEl = renderElementDetailBox;

  const kv = (data: Record<string, unknown>) => {
    // Recursively render value
    const renderValue = (value: unknown): JSX.Element => {
      // Check if it's an element first
      if (isElementField(value)) {
        return <>{elementEl(value)}</>;
      }

      // Check if it's an array
      if (Array.isArray(value)) {
        // Check if array contains elements
        if (value.some((item) => isElementField(item))) {
          return (
            <>
              {value.map((item, index) => (
                <div key={index}>{renderValue(item)}</div>
              ))}
            </>
          );
        }
        // Regular array
        return <pre>{JSON.stringify(value, undefined, 2)}</pre>;
      }

      // Check if it's an object (and not null)
      if (typeof value === 'object' && value !== null) {
        // Recursively render nested object
        const nestedKv = Object.keys(value).map((nestedKey) => {
          const nestedValue = (value as any)[nestedKey];
          return (
            <div key={nestedKey} className="nested-kv">
              <span className="nested-key">{nestedKey}: </span>
              {renderValue(nestedValue)}
            </div>
          );
        });
        return <>{nestedKv}</>;
      }

      // Primitive value
      return <pre>{JSON.stringify(value, undefined, 2)}</pre>;
    };

    if (Array.isArray(data) || typeof data !== 'object') {
      return (
        <pre className="description-content">
          {JSON.stringify(data, undefined, 2)}
        </pre>
      );
    }

    return Object.keys(data).map((key) => {
      const value = data[key];
      return (
        <pre className="description-content" key={key}>
          {key} {renderValue(value)}
        </pre>
      );
    });
  };

  const metaKVElement = MetaKV({
    data: [
      {
        key: 'type',
        content: (task && typeStr(task)) || '',
      },
      {
        key: 'status',
        content: task?.status || '',
      },
      {
        key: 'start',
        content: fullTimeStrWithMilliseconds(task?.timing?.start),
      },
      ...(timingDetailLines.length > 0
        ? [
            {
              key: 'timing detail',
              content: (
                <div className="description-content">
                  {timingDetailLines.map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              ),
            },
          ]
        : []),
      {
        key: 'end',
        content: fullTimeStrWithMilliseconds(task?.timing?.end),
      },
      {
        key: 'total time',
        content: timeCostStrElement(task?.timing?.cost),
      },
      ...(aiActContextValue
        ? [
            {
              key: 'act context',
              content: (
                <pre className="act-context-source">{aiActContextValue}</pre>
              ),
            },
          ]
        : []),
      ...(task?.usage?.time_cost
        ? [
            {
              key: 'AI service time',
              content: <pre>{timeCostStrElement(task?.usage?.time_cost)}</pre>,
            },
          ]
        : []),
      ...(task?.hitBy
        ? [
            {
              key: 'hitBy',
              content: (() => {
                const hitBy = task.hitBy as any;
                // Special handling for Cache with yamlString
                if (hitBy.from === 'Cache' && hitBy.context?.yamlString) {
                  return (
                    <>
                      <div>
                        <strong>from:</strong> {hitBy.from}
                      </div>
                      <div>
                        <strong>context:</strong>
                      </div>
                      <pre className="description-content yaml-content">
                        {hitBy.context.yamlString}
                      </pre>
                    </>
                  );
                }
                // Default JSON rendering
                return <pre>{JSON.stringify(hitBy, undefined, 2)}</pre>;
              })(),
            },
          ]
        : []),
      ...(task?.searchAreaUsage
        ? [
            {
              key: 'searchAreaUsage',
              content: (
                <pre>{JSON.stringify(task.searchAreaUsage, undefined, 2)}</pre>
              ),
            },
          ]
        : []),
      ...(task?.usage
        ? [
            {
              key: 'usage',
              content: <pre>{JSON.stringify(task.usage, undefined, 2)}</pre>,
            },
          ]
        : []),
    ],
  });

  let taskInput: JSX.Element | null = null;
  if (task?.type === 'Planning') {
    const planningTask = task as ExecutionTaskPlanning;
    const isPageContextFrozen = Boolean((task?.uiContext as any)?._isFrozen);

    // Extract images from Planning/Locate tasks
    const locateParam = (planningTask as any)?.param;
    const images = extractTaskImages(locateParam);

    // Get subGoalStatus and memoriesStatus from param
    const subGoalStatus = (planningTask.param as any)?.subGoalStatus;
    const memoriesStatus = (planningTask.param as any)?.memoriesStatus;
    const locateContext =
      planningTask.subType === 'Locate'
        ? (planningTask.param as any)?.context
        : undefined;

    if (planningTask.param?.userInstruction) {
      const instructionContent =
        typeof planningTask.param.userInstruction === 'string'
          ? planningTask.param.userInstruction
          : planningTask.param.userInstruction.prompt;

      taskInput = MetaKV({
        data: [
          {
            key: 'instruction',
            content: instructionContent,
            images: images,
          },
          ...(memoriesStatus
            ? [
                {
                  key: 'memories',
                  content: memoriesStatus,
                },
              ]
            : []),
          ...(subGoalStatus
            ? [
                {
                  key: 'sub-goal status',
                  content: subGoalStatus,
                },
              ]
            : []),
          ...(isPageContextFrozen
            ? [
                {
                  key: 'UI Context',
                  content: <Tag color="blue">Frozen Context 🧊</Tag>,
                },
              ]
            : []),
        ],
      });
    } else {
      // Ensure paramStr result is a string
      const paramValue = paramStr(task);
      const promptContent =
        typeof paramValue === 'string'
          ? paramValue
          : JSON.stringify(paramValue);

      taskInput = MetaKV({
        data: [
          {
            key: 'userPrompt',
            content: promptContent,
            images: images,
          },
          ...(locateContext
            ? [
                {
                  key: 'context',
                  content: (
                    <pre className="act-context-source">{locateContext}</pre>
                  ),
                },
              ]
            : []),
          ...(memoriesStatus
            ? [
                {
                  key: 'memories',
                  content: memoriesStatus,
                },
              ]
            : []),
          ...(subGoalStatus
            ? [
                {
                  key: 'sub-goal status',
                  content: subGoalStatus,
                },
              ]
            : []),
          ...(isPageContextFrozen
            ? [
                {
                  key: 'UI Context',
                  content: <Tag color="blue">Frozen Context 🧊</Tag>,
                },
              ]
            : []),
        ],
      });
    }
  } else if (task?.type === 'Insight') {
    const isPageContextFrozen = Boolean((task?.uiContext as any)?._isFrozen);

    // Use extractInsightParam to get content and images
    const taskParam = (task as any)?.param;
    const { content: displayContent, images } = extractInsightParam(taskParam);

    // Fallback to paramStr if no content extracted
    const finalContent = displayContent || paramStr(task);

    taskInput = MetaKV({
      data: [
        ...(finalContent
          ? [
              {
                key: 'param',
                content: finalContent,
                images: images,
              },
            ]
          : []),
        ...(task?.param?.id
          ? [
              {
                key: 'id',
                content: task.param.id,
              },
            ]
          : []),
        ...(taskParam?.context
          ? [
              {
                key: 'context',
                content: (
                  <pre className="act-context-source">{taskParam.context}</pre>
                ),
              },
            ]
          : []),
        ...(isPageContextFrozen
          ? [
              {
                key: 'UI Context',
                content: <Tag color="blue">Frozen Context 🧊</Tag>,
              },
            ]
          : []),
      ],
    });
  } else if (task?.type === 'Action Space') {
    const actionTask = task as ExecutionTaskAction;

    // Helper to convert to string
    const toContent = (value: any) =>
      typeof value === 'string' ? value : JSON.stringify(value);

    const images = extractTaskImages(actionTask?.param);
    const data: {
      key: string;
      content: string;
      images?: { name: string; url: string }[];
    }[] = [];

    if (actionTask?.param && typeof actionTask.param === 'object') {
      Object.entries(actionTask.param).forEach(([key, value]) => {
        data.push({
          key,
          content: toContent(value),
          images: key === 'locate' ? images : undefined,
        });
      });
    }

    // Fallback to paramStr if param is not an object
    if (data.length === 0) {
      data.push({
        key: 'value',
        content: toContent(paramStr(task)),
        images: images,
      });
    }

    taskInput = MetaKV({ data });
  } else if (task?.type === 'Log') {
    taskInput = task.param?.content ? (
      <pre className="log-content">{task.param.content}</pre>
    ) : null;
  }

  let outputDataContent = null;
  const actions = (task as ExecutionTaskPlanning)?.output?.actions;

  // Error details can coexist with located elements.
  const error = getTaskErrorDisplay(task);
  const errorContent = error ? <ErrorCard error={error} /> : null;

  if (elements?.length) {
    const elementsContent = elements.map((element, idx) => {
      const ifHighlight = false; // highlightElements.includes(element);
      const highlightColor = ifHighlight
        ? highlightColorForType('element')
        : undefined;

      const elementKV = kv(
        objectWithoutKeys(element as any, [
          'content',
          'left',
          'top',
          'right',
          'bottom',
          'locator',
        ]),
      );

      return (
        <Card
          title={
            'content' in element && typeof element.content === 'string'
              ? element.content
              : undefined
          }
          highlightWithColor={highlightColor}
          subtitle=""
          content={elementKV}
          key={idx}
        />
      );
    });

    // Combine elements with error if both exist
    outputDataContent = (
      <>
        {errorContent}
        {elementsContent}
      </>
    );
  } else if (errorContent) {
    // Only error, no elements
    outputDataContent = errorContent;
  } else if (task?.type === 'Insight' && task.subType === 'Assert') {
    const assertTask = task as ExecutionTaskInsightAssertion;
    const thought = assertTask.thought;
    const output = assertTask.output;
    outputDataContent = (
      <>
        {thought && (
          <Card
            liteMode={true}
            title="thought"
            content={<pre className="description-content">{thought}</pre>}
          />
        )}

        <Card
          liteMode={true}
          title="assertion result"
          content={
            <pre className="description-content">
              {JSON.stringify(output, undefined, 2)}
            </pre>
          }
        />
        {reasoningContent && (
          <CollapsibleCard title="reasoning" content={reasoningContent} />
        )}
      </>
    );
  } else if (actions) {
    if (task?.subType === 'LoadYaml') {
      outputDataContent = (
        <Card
          liteMode={true}
          title=""
          content={
            <pre className="description-content yaml-content">
              {(task as ExecutionTaskPlanning).output?.yamlString}
            </pre>
          }
        />
      );
    } else {
      const planItems: JSX.Element[] = [];

      // Add Thought if exists
      if ((task as ExecutionTaskPlanning).output?.thought) {
        planItems.push(
          <Card
            key="thought"
            liteMode={true}
            title="thought"
            content={
              <pre className="description-content">
                {(task as ExecutionTaskPlanning).output?.thought || ''}
              </pre>
            }
          />,
        );
      }

      // Add Memory if exists
      if ((task as ExecutionTaskPlanning).output?.memory) {
        planItems.push(
          <Card
            key="memory"
            liteMode={true}
            title="memory"
            content={
              <pre className="description-content">
                {(task as ExecutionTaskPlanning).output?.memory}
              </pre>
            }
          />,
        );
      }

      // Add Sub-goals if exists
      const updateSubGoals = (task as ExecutionTaskPlanning).output
        ?.updateSubGoals;
      if (updateSubGoals && updateSubGoals.length > 0) {
        const subGoalsContent = updateSubGoals
          .map(
            (goal: { index: number; status: string; description: string }) =>
              `${goal.index}. ${goal.description} (${goal.status})`,
          )
          .join('\n');
        planItems.push(
          <Card
            key="sub-goals"
            liteMode={true}
            title="sub-goals"
            content={
              <pre className="description-content">{subGoalsContent}</pre>
            }
          />,
        );
      }

      // Add Mark Finished Indexes if exists
      const markFinishedIndexes = (task as ExecutionTaskPlanning).output
        ?.markFinishedIndexes;
      if (markFinishedIndexes && markFinishedIndexes.length > 0) {
        planItems.push(
          <Card
            key="mark-finished"
            liteMode={true}
            title="marked finished"
            content={
              <pre className="description-content">
                Sub-goal indexes: {markFinishedIndexes.join(', ')}
              </pre>
            }
          />,
        );
      }

      // Add each plan action
      actions.forEach((action, index) => {
        const paramToShow = isPlainObject(action.param) ? action.param : {};
        const actionType = action.type || '';

        // Create a Card for each param key
        if (Object.keys(paramToShow).length > 0) {
          Object.keys(paramToShow).forEach((key) => {
            const paramValue = paramToShow[key];

            // Render content based on value type
            let content: JSX.Element;
            if (isElementField(paramValue)) {
              // Render as element
              content = elementEl(paramValue);
            } else if (Array.isArray(paramValue)) {
              // Check if array contains elements
              if (paramValue.some((item) => isElementField(item))) {
                content = (
                  <div>
                    {paramValue.map((item, idx) => (
                      <div key={idx}>
                        {isElementField(item) ? (
                          elementEl(item)
                        ) : (
                          <pre>{JSON.stringify(item, undefined, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                );
              } else {
                // Regular array
                content = (
                  <pre className="description-content">
                    {JSON.stringify(paramValue, undefined, 2)}
                  </pre>
                );
              }
            } else if (typeof paramValue === 'object' && paramValue !== null) {
              // Object
              content = (
                <pre className="description-content">
                  {JSON.stringify(paramValue, undefined, 2)}
                </pre>
              );
            } else {
              // Primitive value
              content = (
                <pre className="description-content">{String(paramValue)}</pre>
              );
            }

            planItems.push(
              <Card
                key={`plan-${index}-${key}`}
                liteMode={true}
                title={`${actionType}.${key}`}
                subtitle={action.thought}
                content={content}
              />,
            );
          });
        } else {
          // If no params or param is not an object, still show the action
          // For non-object params (e.g., string), show the value
          const nonObjectContent =
            action.param !== null && action.param !== undefined ? (
              <pre className="description-content">
                {typeof action.param === 'string'
                  ? action.param
                  : JSON.stringify(action.param, undefined, 2)}
              </pre>
            ) : null;
          planItems.push(
            <Card
              key={`plan-${index}`}
              liteMode={true}
              title={typeStr(action as any)}
              subtitle={action.thought}
              content={nonObjectContent}
            />,
          );
        }
      });

      // Add output message if exists (from <complete> tag)
      const outputMessage = (task as ExecutionTaskPlanning).output?.output;
      if (outputMessage) {
        planItems.push(
          <Card
            key="output-message"
            liteMode={true}
            title="output"
            content={<pre className="description-content">{outputMessage}</pre>}
          />,
        );
      }

      // Add More actions needed if exists
      if (
        typeof (task as ExecutionTaskPlanning).output
          ?.shouldContinuePlanning === 'boolean'
      ) {
        planItems.push(
          <Card
            key="more-actions"
            liteMode={true}
            title="should continue planning"
            content={
              <pre className="description-content">
                {(task as ExecutionTaskPlanning).output?.shouldContinuePlanning
                  ? 'true'
                  : 'false'}
              </pre>
            }
          />,
        );
      }

      // Add reasoning at the end
      if (reasoningContent) {
        planItems.push(
          <CollapsibleCard
            key="reasoning"
            title="reasoning"
            content={reasoningContent}
          />,
        );
      }

      outputDataContent = planItems;
    }
  } else {
    let data;

    if (task?.output !== undefined) {
      data = task.output;
    } else if (dump?.data !== undefined) {
      data = dump.data;
    }

    const thought = task?.thought;

    if (data !== undefined) {
      const outputItems: JSX.Element[] = [];

      // Add thought if exists
      if (thought) {
        outputItems.push(
          <Card
            key="thought"
            liteMode={true}
            content={<pre>{thought}</pre>}
            title="thought"
          />,
        );
      }

      // Handle output data
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        // For object output, create a Card for each field
        Object.entries(data).forEach(([key, value]) => {
          let content: JSX.Element;

          if (isElementField(value)) {
            content = elementEl(value);
          } else if (typeof value === 'object' && value !== null) {
            // Check if it's a locate object
            const valueAsAny = value as any;
            if (valueAsAny.locate && isElementField(valueAsAny.locate)) {
              content = (
                <div>
                  <div style={{ marginBottom: '8px' }}>locate:</div>
                  {renderElementDetailBox(valueAsAny.locate)}
                </div>
              );
            } else {
              content = (
                <pre className="description-content">
                  {JSON.stringify(value, undefined, 2)}
                </pre>
              );
            }
          } else {
            content = (
              <pre className="description-content">{String(value)}</pre>
            );
          }

          outputItems.push(
            <Card key={key} liteMode={true} title={key} content={content} />,
          );
        });
      } else {
        // For non-object output, show as-is
        outputItems.push(
          <Card
            key="output"
            liteMode={true}
            title="output"
            content={
              <pre className="description-content">
                {JSON.stringify(data, undefined, 2)}
              </pre>
            }
          />,
        );
      }

      // Add reasoning at the end
      if (reasoningContent) {
        outputItems.push(
          <CollapsibleCard
            key="reasoning"
            title="reasoning"
            content={reasoningContent}
          />,
        );
      }

      if (outputItems.length > 0) {
        outputDataContent = outputItems;
      }
    }
  }

  return (
    <div className="detail-side">
      <div className="info-tabs">
        <div className="info-tab">Information</div>
      </div>
      <div className="info-content">
        <details open>
          <summary>
            <span className="summary-text">Param</span>
          </summary>
          {taskInput}
        </details>
        {outputDataContent && (
          <details open>
            <summary>
              <span className="summary-text">
                {task?.subType === 'Locate' ? 'Element' : 'Output'}
              </span>
            </summary>
            <div className="item-list">{outputDataContent}</div>
          </details>
        )}
        <details open>
          <summary>
            <span className="summary-text">Meta</span>
          </summary>
          {metaKVElement}
        </details>
      </div>
    </div>
  );
};

export default DetailSide;
