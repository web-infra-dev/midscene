import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { Modal, Progress, Typography } from 'antd';
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

const ConfettiAnimation: React.FC = () => {
  const [particles, setParticles] = useState<
    Array<{ id: number; left: number; delay: number; duration: number }>
  >([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 4 + Math.random() * 2,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      {particles.map((particle) => (
        <div
          key={particle.id}
          style={{
            position: 'absolute',
            left: `${particle.left}%`,
            top: '-10px',
            width: '6px',
            height: '6px',
            backgroundColor: [
              '#ff6b6b',
              '#4ecdc4',
              '#45b7d1',
              '#f9ca24',
              '#f0932b',
              '#eb4d4b',
              '#6c5ce7',
            ][particle.id % 7],
            borderRadius: '50%',
            animation: `confetti-fall ${particle.duration}s linear ${particle.delay}s forwards`,
          }}
        />
      ))}
      <style>
        {`
          @keyframes confetti-fall {
            0% {
              transform: translateY(-10px) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translateY(400px) rotate(720deg);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  );
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
    if (showConfetti && !confettiVisible) {
      setConfettiVisible(true);
      const timer = setTimeout(() => {
        setConfettiVisible(false);
        // 延迟2秒再调用onComplete,让撒花特效先展示一会
        setTimeout(() => {
          onComplete?.();
        }, 2000);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti, confettiVisible, onComplete]);

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
        style={{ position: 'relative' }}
      >
        {confettiVisible && <ConfettiAnimation />}
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

          {allCompleted && !showConfetti && (
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
