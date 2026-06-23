import { type CSSProperties, useEffect, useState } from 'react';

const CDN_BASE =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/luljzkpt/ljhwZthlaukjlkulzlp/benchmark/AndroidWorld/20260612/';

const REPORT_FILE_PATTERN = /^Task-\d+-[A-Za-z0-9_.-]+\.html$/;

const previewStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100vw',
  height: '100vh',
  maxWidth: 'none',
  maxHeight: 'none',
  margin: 0,
  padding: 0,
  border: 0,
  zIndex: 2147483647,
  background: '#fff',
};

const messageStyle: CSSProperties = {
  boxSizing: 'border-box',
  minHeight: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  color: '#1f2937',
  font: '14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  textAlign: 'center',
};

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: 0,
};

interface BenchmarkReportPreviewProps {
  invalidMessage?: string;
  loadingMessage?: string;
  titlePrefix?: string;
}

type PreviewState =
  | {
      active: false;
    }
  | {
      active: true;
      error?: string;
      file?: string;
      src?: string;
    };

export function BenchmarkReportPreview({
  invalidMessage = 'Invalid benchmark report URL.',
  loadingMessage = 'Loading report...',
  titlePrefix = 'Benchmark report',
}: BenchmarkReportPreviewProps) {
  const [state, setState] = useState<PreviewState>({ active: false });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const file = params.get('file') || '';

    if (!file) {
      return;
    }

    const validFile =
      REPORT_FILE_PATTERN.test(file) &&
      !file.includes('..') &&
      !file.includes('/');

    if (!validFile) {
      setState({
        active: true,
        error: invalidMessage,
      });
      return;
    }

    document.title = `${titlePrefix} - ${file}`;
    setState({
      active: true,
      file,
      src: `${CDN_BASE}${encodeURIComponent(file)}`,
    });
  }, [invalidMessage, titlePrefix]);

  if (!state.active) {
    return null;
  }

  if (state.error) {
    return (
      <dialog aria-label={titlePrefix} open style={previewStyle}>
        <div style={messageStyle}>{state.error}</div>
      </dialog>
    );
  }

  return (
    <dialog aria-label={titlePrefix} open style={previewStyle}>
      <iframe
        allow="clipboard-read; clipboard-write; fullscreen"
        src={state.src}
        style={iframeStyle}
        title={state.file || titlePrefix}
      />
      <noscript>
        <div style={messageStyle}>{loadingMessage}</div>
      </noscript>
    </dialog>
  );
}
