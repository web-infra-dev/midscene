import { PlaygroundApp } from '@midscene/playground-app';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ConsolePlatformDefinition, ConsoleSessionSummary } from './types';
import './App.less';

const { Sider, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

declare const __APP_VERSION__: string;

function buildInitialValues(platform?: ConsolePlatformDefinition) {
  return (platform?.fields || []).reduce<Record<string, string | number>>(
    (acc, field) => {
      if (field.defaultValue !== undefined) {
        acc[field.name] = field.defaultValue;
      }
      return acc;
    },
    {},
  );
}

export default function App() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [platforms, setPlatforms] = useState<ConsolePlatformDefinition[]>([]);
  const [sessions, setSessions] = useState<ConsoleSessionSummary[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] =
    useState<string>('android');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [stoppingSessionId, setStoppingSessionId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();

  const selectedPlatform = useMemo(
    () =>
      platforms.find((platform) => platform.id === selectedPlatformId) ||
      platforms[0],
    [platforms, selectedPlatformId],
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPlatforms, nextSessions] = await Promise.all([
        window.midsceneConsole.getPlatforms(),
        window.midsceneConsole.listSessions(),
      ]);
      setPlatforms(nextPlatforms);
      setSessions(nextSessions);

      const nextPlatformId =
        selectedPlatformId || nextPlatforms[0]?.id || 'android';
      setSelectedPlatformId(nextPlatformId);
      form.setFieldsValue(
        buildInitialValues(
          nextPlatforms.find((platform) => platform.id === nextPlatformId),
        ),
      );

      if (nextSessions.length > 0) {
        setSelectedSessionId((current) => current || nextSessions[0].id);
      } else {
        setSelectedSessionId(null);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load console state.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(buildInitialValues(selectedPlatform));
  }, [form, selectedPlatform]);

  const handleCreateSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const values = await form.validateFields();
      const created = await window.midsceneConsole.createSession({
        platformId: selectedPlatformId,
        options: values,
      });
      setSessions((current) => [created, ...current]);
      setSelectedSessionId(created.id);
      messageApi.success(`Created ${created.title}.`);
    } catch (createError) {
      if (
        createError &&
        typeof createError === 'object' &&
        'errorFields' in createError
      ) {
        return;
      }

      console.error(createError);
      const nextError =
        createError instanceof Error
          ? createError.message
          : 'Failed to create the session.';
      setError(nextError);
      messageApi.error(nextError);
    } finally {
      setCreating(false);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    setStoppingSessionId(sessionId);
    try {
      await window.midsceneConsole.stopSession(sessionId);
      setSessions((current) => {
        const nextSessions = current.filter(
          (session) => session.id !== sessionId,
        );
        setSelectedSessionId((currentSelected) => {
          if (currentSelected && currentSelected !== sessionId) {
            return currentSelected;
          }
          return nextSessions[0]?.id || null;
        });
        return nextSessions;
      });
      messageApi.success('Session stopped.');
    } catch (stopError) {
      console.error(stopError);
      messageApi.error(
        stopError instanceof Error
          ? stopError.message
          : 'Failed to stop the session.',
      );
    } finally {
      setStoppingSessionId(null);
    }
  };

  return (
    <>
      {messageContextHolder}
      <Layout className="console-shell">
        <Sider width={380} className="console-sider">
          <div className="console-sider-inner">
            <div className="console-brand">
              <Title level={3} style={{ margin: 0, color: '#fff' }}>
                Midscene Console
              </Title>
              <Paragraph style={{ margin: 0 }}>
                Phase 1 desktop hub for creating and running remote playground
                sessions.
              </Paragraph>
              <div className="console-status">
                <Tag color="blue">Electron</Tag>
                <Tag color="purple">Phase 1</Tag>
                <Tag>{__APP_VERSION__}</Tag>
              </div>
            </div>

            {error ? (
              <Alert
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
                style={{ marginBottom: 16 }}
                message={error}
              />
            ) : null}

            <Card title="Create session" className="console-card">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Text strong style={{ color: '#fff' }}>
                    Platform
                  </Text>
                  <Select
                    style={{ width: '100%', marginTop: 8 }}
                    value={selectedPlatformId}
                    options={platforms.map((platform) => ({
                      value: platform.id,
                      label: platform.title,
                    }))}
                    onChange={setSelectedPlatformId}
                  />
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    {selectedPlatform?.description}
                  </Paragraph>
                </div>

                <Form form={form} layout="vertical">
                  {selectedPlatform?.fields.map((field) => (
                    <Form.Item
                      key={field.name}
                      label={field.label}
                      name={field.name}
                    >
                      {field.type === 'number' ? (
                        <InputNumber
                          style={{ width: '100%' }}
                          placeholder={field.placeholder}
                        />
                      ) : (
                        <Input placeholder={field.placeholder} />
                      )}
                    </Form.Item>
                  ))}
                </Form>

                <Button
                  type="primary"
                  block
                  loading={creating}
                  onClick={handleCreateSession}
                >
                  Create {selectedPlatform?.title || 'session'}
                </Button>
              </Space>
            </Card>

            <Card
              title={`Sessions (${sessions.length})`}
              className="console-card"
            >
              {loading ? (
                <Spin />
              ) : sessions.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No sessions yet"
                />
              ) : (
                <div className="console-session-list">
                  {sessions.map((session) => {
                    const isActive = session.id === selectedSessionId;
                    const sessionLabel =
                      session.runtimeInfo?.platformId || session.platformId;
                    return (
                      <div
                        key={session.id}
                        className={`console-session-item ${isActive ? 'active' : ''}`.trim()}
                        onClick={() => setSelectedSessionId(session.id)}
                      >
                        <div className="console-session-item-header">
                          <div className="console-session-title">
                            <Text strong style={{ color: '#fff' }}>
                              {session.title}
                            </Text>
                            <Text className="console-session-meta">
                              {session.serverUrl}
                            </Text>
                          </div>
                          <Tag color="processing">{sessionLabel}</Tag>
                        </div>
                        <div className="console-action-row">
                          <Text className="console-session-meta">
                            {new Date(session.createdAt).toLocaleString()}
                          </Text>
                          <Popconfirm
                            title="Stop this session?"
                            okText="Stop"
                            cancelText="Cancel"
                            onConfirm={() => handleStopSession(session.id)}
                          >
                            <Button
                              size="small"
                              danger
                              loading={stoppingSessionId === session.id}
                            >
                              Stop
                            </Button>
                          </Popconfirm>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <div className="console-footer-note">
              The computer session automatically minimizes the console window
              before desktop execution and restores it after the response is
              returned.
            </div>
          </div>
        </Sider>
        <Content className="console-content">
          {selectedSession ? (
            <PlaygroundApp
              key={selectedSession.id}
              serverUrl={selectedSession.serverUrl}
              appVersion={__APP_VERSION__}
              title={selectedSession.title}
              offlineTitle="Session offline"
              offlineStatusText="The selected session is unavailable. Stop it and create a new one."
            />
          ) : loading ? (
            <div className="console-empty-state">
              <Spin size="large" />
            </div>
          ) : (
            <div className="console-empty-state">
              <Empty
                description={
                  <div>
                    <Title level={4} style={{ color: '#fff' }}>
                      Create your first session
                    </Title>
                    <Paragraph className="console-empty-text">
                      Pick a platform, create a session, and the selected
                      playground will appear here.
                    </Paragraph>
                  </div>
                }
              />
            </div>
          )}
        </Content>
      </Layout>
    </>
  );
}
