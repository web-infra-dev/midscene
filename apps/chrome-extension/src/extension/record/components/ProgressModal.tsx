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
    Array<{
      id: number;
      angle: number;
      delay: number;
      duration: number;
      size: number;
      shape: string;
      color: string;
      rotateSpeed: number;
      velocity: number;
    }>
  >([]);

  useEffect(() => {
    const colors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
      '#eb4d4b', '#6c5ce7', '#a55eea', '#26de81', '#fd79a8',
      '#fdcb6e', '#e17055', '#74b9ff', '#00b894', '#e84393'
    ];
    const shapes = ['circle', 'square', 'triangle', 'star', 'heart'];

    const newParticles = Array.from({ length: 80 }, (_, i) => ({
      id: i,
      angle: (360 / 80) * i + Math.random() * 30 - 15, // 增加随机性
      delay: Math.random() * 0.5,
      duration: 2.5 + Math.random() * 2.5,
      size: 3 + Math.random() * 10,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
      rotateSpeed: 360 + Math.random() * 1080,
      velocity: 120 + Math.random() * 200, // 增加爆炸范围
    }));
    setParticles(newParticles);
  }, []);

  const getShapeStyle = (particle: any) => {
    const baseStyle = {
      position: 'absolute' as const,
      left: '50%',
      top: '50%',
      width: `${particle.size}px`,
      height: `${particle.size}px`,
      animation: `confetti-explode-${particle.id} ${particle.duration}s ease-out ${particle.delay}s forwards`,
      transformOrigin: 'center center',
    };

    switch (particle.shape) {
      case 'square':
        return {
          ...baseStyle,
          backgroundColor: particle.color,
          transform: 'rotate(45deg)',
        };
      case 'triangle':
        return {
          ...baseStyle,
          width: '0',
          height: '0',
          borderLeft: `${particle.size / 2}px solid transparent`,
          borderRight: `${particle.size / 2}px solid transparent`,
          borderBottom: `${particle.size}px solid ${particle.color}`,
          backgroundColor: 'transparent',
        };
      case 'star':
        return {
          ...baseStyle,
          background: particle.color,
          clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
        };
      case 'heart':
        return {
          ...baseStyle,
          background: particle.color,
          borderRadius: '50px 50px 0 0',
          transform: 'rotate(-45deg)',
          '&::before': {
            content: '""',
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            position: 'absolute',
            left: `${particle.size / 2}px`,
            top: '0',
            background: particle.color,
            borderRadius: '50px 50px 0 0',
            transform: 'rotate(-45deg)',
            transformOrigin: '0 100%',
          },
          '&::after': {
            content: '""',
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            position: 'absolute',
            left: '0',
            top: `-${particle.size / 2}px`,
            background: particle.color,
            borderRadius: '50px 50px 0 0',
            transform: 'rotate(45deg)',
            transformOrigin: '100% 100%',
          }
        };
      default:
        return {
          ...baseStyle,
          backgroundColor: particle.color,
          borderRadius: '50%',
        };
    }
  };

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
          style={getShapeStyle(particle)}
        />
      ))}
      <style>
        {`
          ${particles.map(particle => {
          const radians = (particle.angle * Math.PI) / 180;
          const finalX = Math.cos(radians) * particle.velocity;
          const finalY = Math.sin(radians) * particle.velocity;

          return `
            @keyframes confetti-explode-${particle.id} {
              0% {
                transform: translate(-50%, -50%) rotate(0deg) scale(0);
                opacity: 1;
              }
              15% {
                transform: translate(-50%, -50%) rotate(${particle.rotateSpeed * 0.15}deg) scale(1.2);
                opacity: 1;
              }
              30% {
                transform: translate(calc(-50% + ${finalX * 0.3}px), calc(-50% + ${finalY * 0.3}px)) rotate(${particle.rotateSpeed * 0.3}deg) scale(1);
                opacity: 1;
              }
              100% {
                transform: translate(calc(-50% + ${finalX}px), calc(-50% + ${finalY}px)) rotate(${particle.rotateSpeed}deg) scale(0.2);
                opacity: 0;
              }
            }
          `;
        }).join('')}
          
          @keyframes glow-pulse {
            0% { box-shadow: 0 0 5px rgba(82, 196, 26, 0.3); }
            50% { box-shadow: 0 0 20px rgba(82, 196, 26, 0.6), 0 0 30px rgba(82, 196, 26, 0.4); }
            100% { box-shadow: 0 0 5px rgba(82, 196, 26, 0.3); }
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
    // 只有在所有步骤都完成且showConfetti为true时才显示撒花特效
    const allStepsCompleted = steps.every((step) => step.status === 'completed');

    if (showConfetti && allStepsCompleted && !confettiVisible) {
      setConfettiVisible(true);
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
          position: 'relative'
        }}
        className={confettiVisible ? 'celebrating' : ''}
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

          {allCompleted && confettiVisible && (
            <div style={{
              textAlign: 'center',
              marginTop: 20,
            }}>
              <Title level={4} style={{
                color: '#52c41a',
                margin: 0,
                textShadow: '0 0 10px rgba(82, 196, 26, 0.5)'
              }}>
                🎉✨ Generation Complete! ✨🎉
              </Title>
              <div style={{
                fontSize: '14px',
                color: '#666',
                marginTop: 8,
                opacity: 0.8
              }}>
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
