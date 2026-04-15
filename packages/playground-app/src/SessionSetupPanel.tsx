import type {
  PlaygroundPlatformRegistration,
  PlaygroundSessionField,
  PlaygroundSessionSetup,
} from '@midscene/playground';
import { Alert, Form, Input, InputNumber, Radio, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { PlaygroundFormValues } from './controller/types';
import DropdownChevron from './icons/dropdown-chevron.svg';
import MidsceneLogo from './icons/midscene-logo.svg';
import type { PlaygroundSessionViewState } from './session-state';
import './SessionSetupPanel.less';

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

function DropdownSuffix() {
  return (
    <DropdownChevron aria-hidden="true" className="session-setup-select-icon" />
  );
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
        suffixIcon={<DropdownSuffix />}
        options={(platformOptions ?? field.options ?? []).map((option) => ({
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
  form: FormInstance<PlaygroundFormValues>;
  sessionSetup: PlaygroundSessionSetup | null;
  sessionSetupError: string | null;
  sessionViewState: PlaygroundSessionViewState;
  sessionLoading: boolean;
  sessionMutating: boolean;
  onCreateSession: () => void | Promise<void>;
}

const DEFAULT_TITLE = 'Create Agent';
const DEFAULT_DESCRIPTION = 'Create a platform session before running actions.';

export function SessionSetupPanel({
  form,
  sessionSetup,
  sessionSetupError,
  sessionViewState,
  sessionLoading,
  sessionMutating,
  onCreateSession,
}: SessionSetupPanelProps) {
  const submitDisabled =
    sessionMutating ||
    sessionLoading ||
    sessionViewState.setupState === 'blocked';
  const primaryLabel = sessionSetup?.primaryActionLabel ?? DEFAULT_TITLE;
  const title = sessionSetup?.title ?? DEFAULT_TITLE;
  const description = sessionSetup?.description ?? DEFAULT_DESCRIPTION;

  return (
    <div className="session-setup-panel">
      <div className="session-setup-card">
        <MidsceneLogo aria-hidden="true" className="session-setup-logo" />
        <h1 className="session-setup-title">{title}</h1>
        <p className="session-setup-description">{description}</p>

        {sessionViewState.setupState === 'blocked' &&
          sessionViewState.setupBlockingReason && (
            <Alert
              type="error"
              showIcon
              message="Setup blocked"
              description={sessionViewState.setupBlockingReason}
              className="session-setup-alert"
            />
          )}
        {sessionSetupError ? (
          <Alert
            type="error"
            showIcon
            message="Failed to load setup"
            description={sessionSetupError}
            className="session-setup-alert"
          />
        ) : null}

        <Form
          form={form}
          layout="vertical"
          className="session-setup-form"
          onFinish={() => {
            if (submitDisabled) {
              return;
            }
            void onCreateSession();
          }}
        >
          {(sessionSetup?.fields ?? []).map((field) => (
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

          <button
            type="submit"
            className="session-setup-submit"
            disabled={submitDisabled}
          >
            {sessionMutating ? 'Creating...' : primaryLabel}
          </button>
        </Form>
      </div>
    </div>
  );
}
