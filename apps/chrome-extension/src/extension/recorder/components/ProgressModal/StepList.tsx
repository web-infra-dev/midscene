import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { ShinyText } from '@midscene/visualizer';
import { Progress, Typography } from 'antd';
import type React from 'react';
import type { ProgressStep } from '../ProgressModal';

const { Text } = Typography;

interface StepListProps {
  steps: ProgressStep[];
  completedSteps: Set<string>;
  slidingOutSteps: Set<string>;
  getStepIcon: (step: ProgressStep) => React.ReactNode;
  getStepColor: (step: ProgressStep) => string;
}

export const StepList: React.FC<StepListProps> = ({
  steps,
  completedSteps,
  slidingOutSteps,
  getStepIcon,
  getStepColor,
}) => {
  const getConnectorColor = (step: ProgressStep) =>
    step.status === 'completed' ? '#52c41a' : '#e5e7eb';

  return (
    <div className="py-5">
      {steps.map((step, index, filteredSteps) => {
        const previousStep = filteredSteps[index - 1];
        return (
          <div key={step.id} className="flex items-stretch mb-2">
            <div className="relative mr-3 w-5 flex-none" aria-hidden="true">
              {previousStep && (
                <div
                  data-progress-connector="before"
                  className="absolute left-1/2 w-0.5 -translate-x-1/2"
                  style={{
                    top: '-8px',
                    bottom: '50%',
                    backgroundColor: getConnectorColor(previousStep),
                  }}
                />
              )}
              {index < filteredSteps.length - 1 && (
                <div
                  data-progress-connector="after"
                  className="absolute left-1/2 w-0.5 -translate-x-1/2"
                  style={{
                    top: '50%',
                    bottom: '-8px',
                    backgroundColor: getConnectorColor(step),
                  }}
                />
              )}
              <div className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 bg-white leading-none">
                {getStepIcon(step)}
              </div>
            </div>
            <div className="flex-1 border border-[rgba(0,0,0,0.06)] p-[12px] rounded-[12px]">
              {step.status === 'loading' ? (
                <div className="font-semibold text-[14px] leading-[22px] min-h-[22px] flex items-center">
                  <ShinyText
                    text={step.title}
                    disabled={false}
                    speed={3}
                    // className="step-title-shiny"
                  />
                </div>
              ) : (
                <div>
                  <Text
                    strong
                    className="!text-[rgba(0,0,0,1)] text-[14px]"
                    style={{
                      color:
                        step.status === 'completed' ? '#52c41a' : undefined,
                      lineHeight: '22px',
                      minHeight: '22px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {step.title}
                  </Text>
                </div>
              )}
              <Text type="secondary" className="text-xs text-[12px]">
                {step.description}
              </Text>
              {step.details && (
                <>
                  <br />
                  <Text className="text-[11px] !text-[rgba(0, 0, 0, 0.9)]">
                    {step.details}
                  </Text>
                </>
              )}
            </div>
            {/* {step.status === 'loading' && step.progress !== undefined && (
              <div className="ml-8">
                <Progress
                  percent={step.progress}
                  size="small"
                  strokeColor={getStepColor(step)}
                  showInfo={false}
                />
              </div>
            )} */}
          </div>
        );
      })}
    </div>
  );
};
