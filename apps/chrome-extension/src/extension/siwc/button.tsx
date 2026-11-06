import { Alert, Button, Modal, Typography } from 'antd';
import { useState } from 'react';
import { SIWC_LOGIN_MESSAGE } from './auth';

export function SiwcLoginButton() {
  const [pending, setPending] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [error, setError] = useState('');

  const login = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError('');
    try {
      const result = await chrome.runtime.sendMessage({
        type: SIWC_LOGIN_MESSAGE,
      });
      if (!result?.success) {
        throw new Error(result?.error ?? 'Unable to start SIWC authorization.');
      }
      setConfirmationOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Button
        type="link"
        disabled={pending}
        onClick={() => setConfirmationOpen(true)}
        style={{ height: 'auto', padding: 0 }}
      >
        Use your ChatGPT plan →
      </Button>
      <Modal
        title="Sign in with ChatGPT"
        open={confirmationOpen}
        width={420}
        okText="Continue to ChatGPT"
        cancelText="Cancel"
        confirmLoading={pending}
        cancelButtonProps={{ disabled: pending }}
        closable={!pending}
        maskClosable={!pending}
        keyboard={!pending}
        onOk={login}
        onCancel={() => {
          setConfirmationOpen(false);
          setError('');
        }}
      >
        <Typography.Paragraph>
          Sign in with ChatGPT (SIWC) lets you use your ChatGPT plan in Midscene
          without a separate OpenAI API Key. Model usage counts toward your
          ChatGPT plan allowance.
        </Typography.Paragraph>
        <Typography.Paragraph>
          Authorization will open in a new tab. After signing in, follow the
          instructions there, then return here and paste the configuration into
          the Model Env Config field.
        </Typography.Paragraph>
        <Typography.Paragraph>
          Your credentials will be saved locally in this extension. Midscene
          does not collect your credentials.
        </Typography.Paragraph>
        <Typography.Paragraph>
          <Typography.Link
            href="https://midscenejs.com/chatgpt-subscription.html"
            target="_blank"
            rel="noreferrer"
          >
            Learn more about SIWC
          </Typography.Link>
        </Typography.Paragraph>
        {error && <Alert type="error" showIcon message={error} />}
      </Modal>
    </div>
  );
}
