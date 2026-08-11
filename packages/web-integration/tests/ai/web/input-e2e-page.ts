import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const FIELD_STYLES = `
  body {
    box-sizing: border-box;
    max-width: 920px;
    margin: 0 auto;
    padding: 28px;
    color: #172033;
    background: #f5f7fb;
    font-family: Arial, sans-serif;
  }
  .field {
    display: grid;
    gap: 6px;
    margin: 18px 0;
  }
  label, .label {
    font-weight: 700;
  }
  input, textarea, [contenteditable='true'] {
    box-sizing: border-box;
    width: 100%;
    min-height: 46px;
    padding: 10px 12px;
    color: #172033;
    background: white;
    border: 2px solid #9aa6bd;
    border-radius: 8px;
    font: 18px/1.4 Arial, sans-serif;
  }
  textarea, [contenteditable='true'] {
    min-height: 78px;
  }
  .summary {
    margin-top: 22px;
    padding: 16px;
    background: #eaf4ff;
    border: 2px solid #4085c6;
    border-radius: 8px;
    font-size: 18px;
    line-height: 1.6;
  }
  iframe {
    width: 100%;
    height: 330px;
    border: 3px solid #6558d3;
    border-radius: 10px;
  }
`;

const stateScript = (fieldIds: string[]) => `
  const fieldIds = ${JSON.stringify(fieldIds)};
  window.__midsceneInputEvents = [];

  function fieldValue(field) {
    return field.isContentEditable ? field.textContent : field.value;
  }

  function displayValue(value) {
    return value === '' ? '[empty]' : value.replace(/\\n/g, ' / ');
  }

  function updateInputSummary() {
    const values = fieldIds.map((id) => {
      const field = document.getElementById(id);
      return '<div data-summary="' + id + '">' +
        field.dataset.summaryLabel + ': ' +
        displayValue(fieldValue(field)) + '</div>';
    });
    const counts = window.__midsceneInputEvents.reduce((result, event) => {
      result[event.type] = (result[event.type] || 0) + 1;
      return result;
    }, {});
    values.push(
      '<div data-summary="events">Events: beforeinput=' +
        (counts.beforeinput || 0) + ', input=' + (counts.input || 0) +
        ', change=' + (counts.change || 0) + '</div>',
    );
    document.getElementById('input-summary').innerHTML = values.join('');
  }

  for (const id of fieldIds) {
    const field = document.getElementById(id);
    for (const type of ['beforeinput', 'input', 'change']) {
      field.addEventListener(type, () => {
        window.__midsceneInputEvents.push({ id, type, value: fieldValue(field) });
        updateInputSummary();
      });
    }
  }

  window.__midsceneInputState = () => ({
    values: Object.fromEntries(
      fieldIds.map((id) => {
        const field = document.getElementById(id);
        return [id, fieldValue(field)];
      }),
    ),
    events: window.__midsceneInputEvents,
  });
  updateInputSummary();
`;

const TOP_LEVEL_HTML = `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Midscene input modes</title>
      <style>${FIELD_STYLES}</style>
    </head>
    <body>
      <h1>Input mode test page</h1>
      <div class="field">
        <label for="text-input">Text input</label>
        <input
          id="text-input"
          data-summary-label="Text input value"
          value="Alpha value"
        />
      </div>
      <div class="field">
        <label for="notes">Notes textarea</label>
        <textarea
          id="notes"
          data-summary-label="Textarea value"
        >Bravo notes</textarea>
      </div>
      <div class="field">
        <div class="label" id="rich-label">Rich text editor</div>
        <div
          id="rich-editor"
          data-summary-label="Rich text value"
          contenteditable="true"
          role="textbox"
          aria-labelledby="rich-label"
        >Charlie rich text</div>
      </div>
      <div id="input-summary" class="summary" aria-label="Input state summary"></div>
      <script>${stateScript(['text-input', 'notes', 'rich-editor'])}</script>
    </body>
  </html>
`;

const FRAME_HTML = `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Iframe input editor</title>
      <style>${FIELD_STYLES}</style>
    </head>
    <body>
      <h2>Iframe input editor</h2>
      <div class="field">
        <label for="frame-input">Iframe text input</label>
        <input
          id="frame-input"
          data-summary-label="Iframe input value"
          value="Frame initial value"
        />
      </div>
      <div id="input-summary" class="summary" aria-label="Iframe input state summary"></div>
      <script>${stateScript(['frame-input'])}</script>
    </body>
  </html>
`;

const CONTROLLED_HTML = `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Controlled input replacement</title>
      <style>${FIELD_STYLES}</style>
    </head>
    <body>
      <h1>Controlled input replacement</h1>
      <form id="controlled-form" class="field">
        <label for="controlled-input">Controlled text input</label>
        <input id="controlled-input" value="Initial controlled value" />
      </form>
      <div id="controlled-summary" class="summary"></div>
      <script>
        let replacementCount = 0;
        let replacementScheduled = false;

        function updateControlledSummary(input) {
          const value = input.value === '' ? '[empty]' : input.value;
          document.getElementById('controlled-summary').textContent =
            'Controlled value: ' + value +
            ' | Replacement count: ' + replacementCount;
        }

        function attachControlledInput(input) {
          input.addEventListener('input', () => {
            updateControlledSummary(input);
            if (replacementScheduled || input.value !== '') return;
            replacementScheduled = true;
            setTimeout(() => {
              const replacement = document.createElement('input');
              replacement.id = 'controlled-input';
              replacement.value = '';
              input.replaceWith(replacement);
              replacement.focus();
              replacementCount += 1;
              attachControlledInput(replacement);
              updateControlledSummary(replacement);
            }, 250);
          });
        }

        const initialInput = document.getElementById('controlled-input');
        attachControlledInput(initialInput);
        updateControlledSummary(initialInput);
        window.__midsceneControlledState = () => ({
          replacementCount,
          value: document.getElementById('controlled-input').value,
        });
      </script>
    </body>
  </html>
`;

type InputTestServers = {
  close(): Promise<void>;
  controlledUrl: string;
  iframeUrl(mode: 'same-origin' | 'cross-origin'): string;
  topLevelUrl: string;
};

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startInputTestServers(): Promise<InputTestServers> {
  const crossOriginServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(FRAME_HTML);
  });
  const crossOrigin = await listen(crossOriginServer);

  let parentOrigin = '';
  const parentServer = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', parentOrigin);
    let html = TOP_LEVEL_HTML;

    if (requestUrl.pathname === '/controlled') {
      html = CONTROLLED_HTML;
    } else if (requestUrl.pathname === '/frame') {
      html = FRAME_HTML;
    } else if (requestUrl.pathname === '/iframe') {
      const frameSource =
        requestUrl.searchParams.get('mode') === 'cross-origin'
          ? `${crossOrigin}/frame`
          : '/frame';
      html = `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Iframe input host</title>
            <style>${FIELD_STYLES}</style>
          </head>
          <body>
            <h1>Iframe input host</h1>
            <iframe title="Input editor frame" src="${frameSource}"></iframe>
          </body>
        </html>
      `;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  parentOrigin = await listen(parentServer);

  return {
    topLevelUrl: `${parentOrigin}/`,
    controlledUrl: `${parentOrigin}/controlled`,
    iframeUrl: (mode) => `${parentOrigin}/iframe?mode=${mode}`,
    close: async () => {
      await Promise.all([
        closeServer(parentServer),
        closeServer(crossOriginServer),
      ]);
    },
  };
}
