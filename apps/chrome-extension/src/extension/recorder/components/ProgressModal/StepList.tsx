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
  return (
    <div className="py-5">
      {steps.map((step, index, filteredSteps) => {
        const isSliding = slidingOutSteps.has(step.id);
        return (
          <div key={step.id}>
            <div className="flex items-center mb-2">
              <div className="mr-3 min-w-[20px]">{getStepIcon(step)}</div>
              <div className="flex-1">
                {step.status === 'loading' ? (
                  <div className="font-semibold text-[14px] leading-[22px] min-h-[22px] flex items-center">
                    <ShinyText
                      text={step.title}
                      disabled={false}
                      speed={3}
                      className="step-title-shiny"
                    />
                  </div>
                ) : (
                  <div>
                    <Text
                      strong
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
                <Text type="secondary" className="text-xs">
                  {step.description}
                </Text>
                {step.details && (
                  <>
                    <br />
                    <Text type="secondary" className="text-[11px] text-[#666]">
                      {step.details}
                    </Text>
                  </>
                )}
              </div>
            </div>
            {step.status === 'loading' && step.progress !== undefined && (
              <div className="ml-8">
                <Progress
                  percent={step.progress}
                  size="small"
                  strokeColor={getStepColor(step)}
                  showInfo={false}
                />
              </div>
            )}
            {index < filteredSteps.length - 1 && (
              <div
                className={`${step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'} ml-2 w-0.5 h-5 mt-2`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
