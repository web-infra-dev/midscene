import type { TestcaseView } from '../types';

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const collectedAtFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'long',
});

export function DetailsPanel({ testcase }: { testcase: TestcaseView }) {
  const { reference } = testcase;
  const sourceLink = safeExternalUrl(reference.url);
  const collectedAt = new Date(reference.collectedAt);
  const refusal = testcase.groundTruth === 'REFUSAL';
  const coordinateText =
    testcase.groundTruth === 'REFUSAL'
      ? 'REFUSAL'
      : `[${testcase.groundTruth.map((value) => value.toFixed(1)).join(', ')}]`;

  return (
    <aside className="details-panel" aria-label="用例详细信息">
      <section className="detail-section instructions-section">
        <h3>
          定位指令 <span className="section-label">Instruction</span>
        </h3>
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
            <span>中文</span>
          </div>
          <p id="instruction-zh" lang="zh-CN">
            {testcase.instruction.zh}
          </p>
        </div>
      </section>
      <section className="detail-section">
        <h3>
          标准答案 <span className="section-label">Ground Truth</span>
        </h3>
        <div id="gt-point" hidden={refusal}>
          <p className="field-hint">
            原图像素坐标 · [top, right, bottom, left]
          </p>
          <code id="ground-truth" className="ground-truth">
            {coordinateText}
          </code>
        </div>
        <div id="gt-refusal" className="refusal-box" hidden={!refusal}>
          <strong>REFUSAL</strong>
          <p>拒识用例：预期拒绝定位，没有目标框。</p>
        </div>
      </section>
      <section className="detail-section">
        <h3>
          分类依据 <span className="section-label">Category</span>
        </h3>
        <span id="detail-category" className="category-badge">
          {testcase.category.item}
        </span>
        <p id="category-reason" className="category-reason" lang="en">
          {testcase.category.reason}
        </p>
      </section>
      <section className="detail-section reference-section">
        <h3>
          来源信息 <span className="section-label">Reference</span>
        </h3>
        <dl className="reference-fields">
          <div>
            <dt>来源链接</dt>
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
            <dt>数据集</dt>
            <dd id="reference-dataset">{reference.dataset}</dd>
          </div>
          <div>
            <dt>原始记录 ID</dt>
            <dd id="reference-id" className="monospace">
              {reference.recordId}
            </dd>
          </div>
          <div>
            <dt>图片格式</dt>
            <dd id="reference-format" className="monospace">
              {reference.image.format}
            </dd>
          </div>
          <div>
            <dt>图片 SHA-256</dt>
            <dd>
              <code id="reference-sha">{reference.image.sha256}</code>
            </dd>
          </div>
          <div>
            <dt>修订记录</dt>
            <dd
              id="reference-patch"
              className={reference.patch === null ? 'no-patch' : undefined}
            >
              {reference.patch ?? '无修订'}
            </dd>
          </div>
          <div>
            <dt>收录时间</dt>
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
