import { escapeScriptTag } from '@midscene/shared/utils';
import { Alert } from 'antd';
import ReactDOM from 'react-dom/client';
import { Visualizer } from './App';
import type { ExecutionDumpWithPlaywrightAttributes } from './types';
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);

  const dumpElements = document.querySelectorAll(
    'script[type="midscene_web_dump"]',
  );
  if (dumpElements.length === 1 && dumpElements[0].textContent?.trim() === '') {
    const errorPanel = (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: '100px',
          boxSizing: 'border-box',
        }}
      >
        <Alert
          message="Midscene.js - Error"
          description="There is no dump data to display."
          type="error"
          showIcon
        />
      </div>
    );
    root.render(errorPanel);
  } else {
    const reportDump: ExecutionDumpWithPlaywrightAttributes[] = [];
    Array.from(dumpElements)
      .filter((el) => {
        const textContent = el.textContent;
        if (!textContent) {
          console.warn('empty content in script tag', el);
        }
        return !!textContent;
      })
      .forEach((el) => {
        const attributes: Record<string, any> = {};
        Array.from(el.attributes).forEach((attr) => {
          const { name, value } = attr;
          const valueDecoded = decodeURIComponent(value);
          if (name.startsWith('playwright_')) {
            attributes[attr.name] = valueDecoded;
          }
        });

        const content = escapeScriptTag(el.textContent || '');
        try {
          const jsonContent = JSON.parse(content);
          jsonContent.attributes = attributes;
          reportDump.push(jsonContent);
        } catch (e) {
          console.error(el);
          console.error('failed to parse json content', e);
        }
      });

    root.render(<Visualizer dumps={reportDump} />);
  }
} else {
  console.error('no root element found');
}
