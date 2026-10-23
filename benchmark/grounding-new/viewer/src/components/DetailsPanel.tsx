import type { ReactNode } from 'react';
import type { TestcaseView } from '../types';

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const collectedAtFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'long',
});

export function DetailsPanel({
  testcase,
  children,
}: { testcase: TestcaseView; children?: ReactNode }) {
  const { reference } = testcase;
  const sourceLink = safeExternalUrl(reference.url);
  const collectedAt = new Date(reference.collectedAt);
  const refusal = testcase.groundTruth === 'REFUSAL';
  const coordinateText =
    testcase.groundTruth === 'REFUSAL'
      ? 'REFUSAL'
      : `[${testcase.groundTruth.map((value) => value.toFixed(1)).join(', ')}]`;

  return (
    <aside className="details-panel" aria-label="Test case details">
      {children}
      <section className="detail-section instructions-section">
        <h3>Instructions</h3>
        <div className="instruction-card">
          <div className="instruction-heading">
            <span>English</span>
          </div>
          <p id="instruction-en" lang="en">
            {testcase.instruction.en}
          </p>
        </div>
        <div className="instruction-card">
          <div className="instruction-heading">
            <span>Chinese</span>
          </div>
          <p id="instruction-zh" lang="zh-CN">
            {testcase.instruction.zh}
          </p>
        </div>
      </section>
      <section className="detail-section">
        <h3>Ground truth</h3>
        <div id="gt-point" hidden={refusal}>
          <p className="field-hint">
            Original image pixels · [top, right, bottom, left]
          </p>
          <code id="ground-truth" className="ground-truth">
            {coordinateText}
          </code>
        </div>
        <div id="gt-refusal" className="refusal-box" hidden={!refusal}>
          <strong>Refusal</strong>
          <p>The model should return a refusal instead of a target box.</p>
        </div>
      </section>
      <section className="detail-section">
        <h3>Category</h3>
        <span id="detail-category" className="category-badge">
          {testcase.category.item}
        </span>
        <p id="category-reason" className="category-reason" lang="en">
          {testcase.category.reason}
        </p>
      </section>
      <section className="detail-section reference-section">
        <h3>Source</h3>
        <dl className="reference-fields">
          <div>
            <dt>Source URL</dt>
            <dd id="reference-url">
              {sourceLink ? (
                <a href={sourceLink} target="_blank" rel="noopener noreferrer">
                  {reference.url}
                </a>
              ) : (
                reference.url
              )}
            </dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd id="reference-dataset">{reference.dataset}</dd>
          </div>
          <div>
            <dt>Original record ID</dt>
            <dd id="reference-id" className="monospace">
              {reference.recordId}
            </dd>
          </div>
          <div>
            <dt>Image format</dt>
            <dd id="reference-format" className="monospace">
              {reference.image.format}
            </dd>
          </div>
          <div>
            <dt>Image SHA-256</dt>
            <dd>
              <code id="reference-sha">{reference.image.sha256}</code>
            </dd>
          </div>
          <div>
            <dt>Revisions</dt>
            <dd
              id="reference-patch"
              className={reference.patch === null ? 'no-patch' : undefined}
            >
              {reference.patch ?? 'No revisions'}
            </dd>
          </div>
          <div>
            <dt>Collected at</dt>
            <dd>
              <time id="collected-at" dateTime={collectedAt.toISOString()}>
                {collectedAtFormatter.format(collectedAt)}
              </time>
              <code id="collected-timestamp" className="timestamp">
                {reference.collectedAt} · Unix ms
              </code>
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
