import type {
  PlaygroundPlatformRegistration,
  PlaygroundSessionField,
  PlaygroundSessionSetup,
} from '@midscene/playground';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import type { PlaygroundSessionViewState } from './session-state';

const { Paragraph, Title } = Typography;

function getPlatformSelectorFieldKey(
  setup: PlaygroundSessionSetup | null,
): string | undefined {
  return setup?.platformSelector?.fieldKey;
}

function getPlatformSelectorOptions(
  field: PlaygroundSessionField,
  setup: PlaygroundSessionSetup | null,
): PlaygroundSessionField['options'] {
  if (!setup?.platformRegistry?.length) {
    return field.options;
  }

  const registryOptions = setup.platformRegistry.map(
    (platform: PlaygroundPlatformRegistration) => ({
      label: platform.label,
      value: platform.id,
      description:
        [platform.description, platform.unavailableReason]
          .filter(Boolean)
          .join(' · ') || undefined,
    }),
  );

  return registryOptions.length > 0 ? registryOptions : field.options;
}

function renderSessionField(
  field: PlaygroundSessionField,
  sessionSetup: PlaygroundSessionSetup | null,
) {
  if (field.type === 'number') {
    return (
      <InputNumber style={{ width: '100%' }} placeholder={field.placeholder} />
    );
  }

  if (field.type === 'select') {
    const platformSelectorFieldKey = getPlatformSelectorFieldKey(sessionSetup);
    const platformOptions = getPlatformSelectorOptions(field, sessionSetup);
    const shouldRenderPlatformSelector =
      platformSelectorFieldKey === field.key &&
      sessionSetup?.platformSelector?.variant === 'cards';

    if (shouldRenderPlatformSelector) {
      return (
        <Radio.Group className="platform-selector-group">
          {(platformOptions || []).map((option) => (
            <Radio.Button
              key={String(option.value)}
              value={option.value}
              className="platform-selector-card"
            >
              <div className="platform-selector-title">{option.label}</div>
              {option.description ? (
                <div className="platform-selector-description">
                  {option.description}
                </div>
              ) : null}
            </Radio.Button>
          ))}
        </Radio.Group>
      );
    }

    return (
      <Select
        placeholder={field.placeholder}
        options={(platformOptions || field.options || []).map((option) => ({
          label: option.label,
          value: option.value,
          description: option.description,
        }))}
        optionRender={(option) => {
          const description = option.data.description as string | undefined;

          if (!description) {
            return option.data.label;
          }

          return (
            <div className="session-select-option">
              <div className="session-select-option-label">
                {option.data.label}
              </div>
              <div className="session-select-option-description">
                {description}
              </div>
            </div>
          );
        }}
      />
    );
  }

  return <Input placeholder={field.placeholder} />;
}

export interface SessionSetupPanelProps {
  form: FormInstance<Record<string, unknown>>;
  sessionSetup: PlaygroundSessionSetup | null;
  sessionSetupError: string | null;
  sessionViewState: PlaygroundSessionViewState;
  sessionLoading: boolean;
  sessionMutating: boolean;
  onCreateSession: () => void | Promise<void>;
  onRefreshTargets: () => void | Promise<void>;
}

export function SessionSetupPanel({
  form,
  sessionSetup,
  sessionSetupError,
  sessionViewState,
  sessionLoading,
  sessionMutating,
  onCreateSession,
  onRefreshTargets,
}: SessionSetupPanelProps) {
  return (
    <div className="session-setup-panel">
      <div className="session-setup-card">
        <Title level={4}>{sessionSetup?.title || 'Create Agent'}</Title>
        <Paragraph type="secondary">
          {sessionSetup?.description ||
            'Create a platform session before running actions.'}
        </Paragraph>
        {sessionViewState.setupState === 'blocked' &&
          sessionViewState.setupBlockingReason && (
            <Alert
              type="error"
              showIcon
              message="Setup blocked"
              description={sessionViewState.setupBlockingReason}
            />
          )}
        {sessionSetupError ? (
          <Alert
            type="error"
            showIcon
            message="Failed to load setup"
            description={sessionSetupError}
          />
        ) : null}
        <Form form={form} layout="vertical" className="session-setup-form">
          {(sessionSetup?.fields || []).map((field) => (
            <Form.Item
              key={field.key}
              label={field.label}
              name={field.key}
              tooltip={field.description}
              rules={
                field.required
                  ? [
                      {
                        required: true,
                        message: `${field.label} is required`,
                      },
                    ]
                  : undefined
              }
            >
              {renderSessionField(field, sessionSetup)}
            </Form.Item>
          ))}
        </Form>
        <Space size={12}>
          <Button
            type="primary"
            loading={sessionMutating}
            disabled={
              sessionLoading || sessionViewState.setupState === 'blocked'
            }
            onClick={onCreateSession}
          >
            {sessionSetup?.primaryActionLabel || 'Create Agent'}
          </Button>
          <Button onClick={onRefreshTargets} loading={sessionLoading}>
            Refresh targets
          </Button>
        </Space>
      </div>
    </div>
  );
}
