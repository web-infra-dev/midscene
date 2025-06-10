import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Modal, Progress, Typography } from 'antd';
import confetti from 'canvas-confetti';
import type React from 'react';
import { useEffect, useState } from 'react';

const { Text, Title } = Typography;

export interface ProgressStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress?: number;
  details?: string;
}

interface ProgressModalProps {
  open: boolean;
  title: string;
  steps: ProgressStep[];
  onComplete?: () => void;
  showConfetti?: boolean;
}

const triggerConfetti = () => {
  // Create a celebratory confetti effect
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
  };

  function fire(particleRatio: number, opts: any) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });

  fire(0.2, {
    spread: 60,
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
};

export const ProgressModal: React.FC<ProgressModalProps> = ({
  open,
  title,
  steps,
  onComplete,
  showConfetti = false,
}) => {
  const [confettiVisible, setConfettiVisible] = useState(false);

  useEffect(() => {
    // 只有在所有步骤都完成且showConfetti为true时才显示撒花特效
    const allStepsCompleted = steps.every(
      (step) => step.status === 'completed',
    );

    if (showConfetti && allStepsCompleted && !confettiVisible) {
      setConfettiVisible(true);

      // Trigger canvas-confetti effect
      triggerConfetti();

      const timer = setTimeout(() => {
        setConfettiVisible(false);
        // 延迟1秒再调用onComplete,让撒花特效先展示一会
        setTimeout(() => {
          onComplete?.();
        }, 1000);
      }, 3000); // 撒花时间3秒
      return () => clearTimeout(timer);
    }
  }, [showConfetti, confettiVisible, onComplete, steps]);

  // 监听 open 状态变化，重置 confettiVisible
  useEffect(() => {
    if (!open) {
      setConfettiVisible(false);
    }
  }, [open]);

  const getStepIcon = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CheckCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return (
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#d9d9d9',
            }}
          />
        );
    }
  };

  const getStepColor = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return '#1890ff';
      case 'completed':
        return '#52c41a';
      case 'error':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  const allCompleted = steps.every((step) => step.status === 'completed');

  return (
    <>
      <Modal
        title={title}
        open={open}
        closable={false}
        footer={null}
        width={500}
        centered
        maskClosable={false}
        zIndex={20}
        style={{
          position: 'relative',
        }}
      >
        <div style={{ padding: '20px 0' }}>
          {steps.map((step, index) => (
            <div key={step.id} style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ marginRight: 12, minWidth: 20 }}>
                  {getStepIcon(step)}
                </div>
                <div style={{ flex: 1 }}>
                  <Text
                    strong
                    style={{
                      color:
                        step.status === 'completed' ? '#52c41a' : undefined,
                    }}
                  >
                    {step.title}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {step.description}
                  </Text>
                  {step.details && (
                    <>
                      <br />
                      <Text
                        type="secondary"
                        style={{ fontSize: '11px', color: '#666' }}
                      >
                        {step.details}
                      </Text>
                    </>
                  )}
                </div>
              </div>

              {step.status === 'loading' && step.progress !== undefined && (
                <div style={{ marginLeft: 32 }}>
                  <Progress
                    percent={step.progress}
                    size="small"
                    strokeColor={getStepColor(step)}
                    showInfo={false}
                  />
                </div>
              )}

              {index < steps.length - 1 && (
                <div
                  style={{
                    marginLeft: 10,
                    width: 2,
                    height: 20,
                    backgroundColor:
                      step.status === 'completed' ? '#52c41a' : '#e8e8e8',
                    marginTop: 8,
                  }}
                />
              )}
            </div>
          ))}

          {allCompleted && confettiVisible && (
            <div
              style={{
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              <Title
                level={4}
                style={{
                  color: '#52c41a',
                  margin: 0,
                  textShadow: '0 0 10px rgba(82, 196, 26, 0.5)',
                }}
              >
                🎉✨ Generation Complete! ✨🎉
              </Title>
              <div
                style={{
                  fontSize: '14px',
                  color: '#666',
                  marginTop: 8,
                  opacity: 0.8,
                }}
              >
                Your code has been successfully generated!
              </div>
            </div>
          )}

          {allCompleted && !confettiVisible && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <Title level={4} style={{ color: '#52c41a', margin: 0 }}>
                🎉 Generation Complete!
              </Title>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
