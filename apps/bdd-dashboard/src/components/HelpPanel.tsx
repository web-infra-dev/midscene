/**
 * First-run orientation and the "?" help popover: a plain-language intro to
 * the three views, a glossary of the BDD terms the UI uses, and the keyboard
 * shortcut map. Both are dismissible so they stay out of power users' way.
 */
import { useState } from 'react';

const INTRO_DISMISSED_KEY = 'midscene-bdd-dashboard:intro-dismissed';

function readIntroDismissed(): boolean {
  try {
    return localStorage.getItem(INTRO_DISMISSED_KEY) === '1';
  } catch {
    // Storage unavailable (e.g. sandboxed file://) — show it this session.
    return false;
  }
}

/** One-line first-run banner under the header; dismisses permanently. */
export function WelcomeBanner({ onOpenHelp }: { onOpenHelp: () => void }) {
  const [dismissed, setDismissed] = useState(readIntroDismissed);
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INTRO_DISMISSED_KEY, '1');
    } catch {
      // Storage unavailable — dismissal lasts for this session only.
    }
  };
  return (
    <div className="welcome-bar" role="note">
      <span className="welcome-text">
        <b>New here?</b> <b>Stories</b> lists every scenario with its steps, the{' '}
        <b>Flow graph</b> maps which scenarios reuse which flows (shared step
        sequences), and <b>Health</b> flags problems in the suite.
      </span>
      <span className="welcome-actions">
        <button type="button" className="btn" onClick={onOpenHelp}>
          Glossary &amp; shortcuts
        </button>
        <button type="button" className="btn welcome-dismiss" onClick={dismiss}>
          Got it
        </button>
      </span>
    </div>
  );
}

const GLOBAL_SHORTCUTS: [string, string][] = [
  ['/', 'Focus the search box'],
  ['1 · 2 · 3', 'Switch to Stories / Flow graph / Health'],
  ['↑ ↓ or j k', 'Walk the story list'],
  ['Esc', 'Clear the search · close this panel'],
  ['?', 'Open or close this panel'],
];

const GRAPH_SHORTCUTS: [string, string][] = [
  ['Hover', 'Preview everything a node calls and is called by'],
  ['Click / Enter', 'Pin that highlight in place'],
  ['Double-click', 'Open the node in Stories'],
  ['Drag', 'Pan around the canvas'],
  ['Ctrl + scroll', 'Zoom toward the cursor'],
];

const GLOSSARY: [string, string][] = [
  [
    'Scenario',
    'One test case written in Gherkin — a name plus Given/When/Then steps.',
  ],
  [
    'Flow',
    'A reusable scenario tagged @flow. Other scenarios run it as a single ' +
      'step (e.g. "Given I am logged in as …"); @param: declares the ' +
      '<placeholders> its steps accept.',
  ],
  [
    'Flow call',
    'A step that runs a flow. In Stories, expand the "→ Flow:" row under a ' +
      'step to read the nested steps inline.',
  ],
  [
    'Step routing',
    'Where a step executes. Unmarked steps run on the Midscene UI agent; an ' +
      '"agent" badge (# @agent or a $skill token) sends the step to a ' +
      'general coding agent; "no-ai" runs a classic user-registered callback.',
  ],
  [
    'soft',
    'A soft check: if it fails, the runner logs a warning instead of ' +
      'failing the run.',
  ],
];

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

/** The "?" popover: views intro, shortcut map, and glossary. */
export function HelpPanel({ open, onClose }: HelpPanelProps) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="help-backdrop"
        aria-label="Close help"
        onClick={onClose}
      />
      <dialog open className="help-panel" aria-label="Help">
        <div className="help-head">
          <h3>How this dashboard works</h3>
          <button
            type="button"
            className="help-close"
            onClick={onClose}
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <p className="help-intro">
          This is a static snapshot of a <b>midscene-bdd</b> test suite —
          nothing here runs tests, it lets you read and review them.{' '}
          <b>Stories</b> is the suite itself, the <b>Flow graph</b> shows how
          scenarios share reusable flows, and <b>Health</b> lists problems found
          while parsing.
        </p>

        <h4>Glossary</h4>
        <dl className="help-glossary">
          {GLOSSARY.map(([term, definition]) => (
            <div key={term} className="help-term">
              <dt>{term}</dt>
              <dd>{definition}</dd>
            </div>
          ))}
        </dl>

        <h4>Keyboard shortcuts</h4>
        <table className="help-keys">
          <tbody>
            {GLOBAL_SHORTCUTS.map(([keys, what]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4>In the flow graph</h4>
        <table className="help-keys">
          <tbody>
            {GRAPH_SHORTCUTS.map(([keys, what]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </dialog>
    </>
  );
}
