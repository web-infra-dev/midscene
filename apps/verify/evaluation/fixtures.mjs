// Ground truth lives outside planner input. The defective fixture deliberately
// omits persistence; no expected-outcome labels are sent to either model.
export function notesHtml({ persist = true, validation = false } = {}) {
  return `<!doctype html><html><head><title>Notes</title></head>
<body style="font:24px system-ui;padding:40px;max-width:850px">
<h1>Notes</h1><label>Note <input id="note" style="font:24px system-ui"></label>
<button id="save" style="font:24px system-ui">Save</button>
<button id="reload" style="font:24px system-ui">Reload persisted notes</button>
<p id="status">${validation ? 'Enter a note before saving' : 'Ready'}</p>
<h2>Saved notes</h2><ul id="notes"></ul>
<script>
const input = document.getElementById('note');
const status = document.getElementById('status');
const list = document.getElementById('notes');
let notes = JSON.parse(localStorage.getItem('notes') || '[]');
function render() {
  list.replaceChildren(...notes.map(text => {
    const item = document.createElement('li'); item.textContent = text; return item;
  }));
}
document.getElementById('save').onclick = () => {
  if (!input.value.trim()) { status.textContent = 'Enter a note before saving'; return; }
  notes.push(input.value.trim());
  ${persist ? "localStorage.setItem('notes', JSON.stringify(notes));" : ''}
  render(); status.textContent = 'Saved successfully'; input.value = '';
};
document.getElementById('reload').onclick = () => {
  notes = JSON.parse(localStorage.getItem('notes') || '[]'); render(); status.textContent = 'Reloaded';
};
render();
</script></body></html>`;
}

export function scenario(id) {
  switch (id) {
    case 'save-working':
      return {
        demand: 'Saving a note shows Saved successfully and the saved text.',
        html: notesHtml(),
      };
    case 'persistence-broken':
      return {
        demand:
          'Saved text remains visible after pressing Reload persisted notes.',
        html: notesHtml({ persist: false }),
      };
    case 'empty-input-working':
      return {
        demand:
          'Empty and whitespace-only submissions show Enter a note before saving and add no item.',
        html: notesHtml(),
      };
    case 'ambiguous-demand':
      return {
        demand:
          'Change the Save result to the new behavior. The desired result has not been specified; ask which result is intended.',
        html: notesHtml(),
      };
    case 'visible-validation-working':
      return {
        demand:
          'On opening the page, Enter a note before saving is visible and the saved notes list is empty.',
        html: notesHtml({ validation: true }),
      };
    case 'preview-unavailable':
    case 'stale-revision':
      return { html: notesHtml(), boundary: true };
    case 'action-not-completed':
      return {
        html: '<!doctype html><h1>No controls available</h1><p>This preview has no buttons.</p>',
        boundary: true,
      };
    default:
      throw new Error(`Unknown fixture: ${id}`);
  }
}

export function fixtureApi(html, demand, headSha) {
  const pr = {
    number: 1,
    title: 'Update note editor',
    body: demand,
    changed_files: 1,
    head: { sha: headSha },
    base: { sha: 'b'.repeat(40), repo: { private: false } },
  };
  return {
    pr,
    api: async (_method, route) => {
      if (route === '/pulls/1') return pr;
      if (route.startsWith('/pulls/1/files?'))
        return [
          {
            filename: 'index.html',
            status: 'added',
            patch: html
              .split('\n')
              .map((line) => `+${line}`)
              .join('\n'),
          },
        ];
      if (route === `/contents/index.html?ref=${headSha}`)
        return {
          type: 'file',
          encoding: 'base64',
          size: Buffer.byteLength(html),
          content: Buffer.from(html).toString('base64'),
        };
      throw Object.assign(new Error('Fixture source not found'), {
        status: 404,
      });
    },
  };
}
