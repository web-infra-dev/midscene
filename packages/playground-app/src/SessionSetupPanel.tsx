import { useT } from '@midscene/i18n';
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

export function getPlatformSelectorOptions(
  field: PlaygroundSessionField,
  setup: PlaygroundSessionSetup | null,
): PlaygroundSessionField['options'] {
  if (
    getPlatformSelectorFieldKey(setup) !== field.key ||
    !setup?.platformRegistry?.length
  ) {
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

export function SessionSetupPanel({
  form,
  sessionSetup,
  sessionSetupError,
  sessionViewState,
  sessionLoading,
  sessionMutating,
  onCreateSession,
}: SessionSetupPanelProps) {
  const t = useT();
  const defaultTitle = t('sessionSetup.defaultTitle');
  const defaultDescription = t('sessionSetup.defaultDescription');
  const submitDisabled =
    sessionMutating ||
    sessionLoading ||
    sessionViewState.setupState === 'blocked';
  const primaryLabel = sessionSetup?.primaryActionLabel ?? defaultTitle;
  const title = sessionSetup?.title ?? defaultTitle;
  const description = sessionSetup?.description ?? defaultDescription;

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
              message={t('sessionSetup.setupBlocked')}
              description={sessionViewState.setupBlockingReason}
              className="session-setup-alert"
            />
          )}
        {sessionSetupError ? (
          <Alert
            type="error"
            showIcon
            message={t('sessionSetup.failedToLoadSetup')}
            description={sessionSetupError}
            className="session-setup-alert"
          />
        ) : null}
        {sessionSetup?.notice ? (
          <Alert
            type={sessionSetup.notice.type}
            showIcon
            message={sessionSetup.notice.message}
            description={sessionSetup.notice.description}
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
                        message: t('sessionSetup.fieldRequired').replace(
                          '{label}',
                          field.label,
                        ),
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
            {sessionMutating ? t('sessionSetup.creating') : primaryLabel}
          </button>
        </Form>
      </div>
    </div>
  );
}
