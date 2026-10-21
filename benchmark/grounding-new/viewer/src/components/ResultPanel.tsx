import type { EvaluationResult } from '../types';

export function ResultStatus({ result }: { result?: EvaluationResult }) {
  const status = !result
    ? 'pending'
    : result.prediction.outcome === 'ERROR'
      ? 'error'
      : result.correct
        ? 'passed'
        : 'failed';
  return (
    <span className={`evaluation-status ${status}`}>
      {
        {
          pending: '暂无结果',
          error: '执行出错',
          passed: '通过',
          failed: '未通过',
        }[status]
      }
    </span>
  );
}

export function ResultPanel({
  runId,
  result,
}: {
  runId: string;
  result: EvaluationResult;
}) {
  const { prediction } = result;

  return (
    <section
      className="detail-section evaluation-section"
      aria-label="评测结果"
    >
      <div className="evaluation-heading">
        <h3>
          评测结果 <span className="section-label">Evaluation</span>
        </h3>
      </div>
      <div className="evaluation-summary">
        <ResultStatus result={result} />
        <span>{(result.durationMs / 1000).toFixed(2)} s</span>
      </div>
      <dl className="reference-fields evaluation-metadata">
        <div>
          <dt>Run</dt>
          <dd>{runId}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{result.model}</dd>
        </div>
      </dl>
      <div className="prediction-value">
        <span className="field-hint">模型预测</span>
        {prediction.outcome === 'POINT' ? (
          <code>
            {prediction.center
              ? `[${prediction.center.join(', ')}]`
              : '未返回预测坐标'}
          </code>
        ) : (
          <strong>
            {prediction.outcome === 'REFUSAL' ? '拒识' : '执行异常'}
          </strong>
        )}
        {prediction.outcome === 'POINT' && (
          <span className="field-hint">原图像素坐标 · [x, y]</span>
        )}
      </div>
      {result.error && <pre className="evaluation-error">{result.error}</pre>}
      <details className="evaluation-snapshot">
        <summary>执行指令与标注</summary>
        <p className="field-hint">
          {result.instructionLanguage === 'en' ? 'English' : '中文'}
        </p>
        <p lang={result.instructionLanguage}>{result.instruction}</p>
        <p className="field-hint">
          运行时 Ground Truth · [top, right, bottom, left]
        </p>
        <code className="ground-truth">
          {JSON.stringify(result.groundTruth)}
        </code>
        {prediction.outcome === 'POINT' && prediction.rect && (
          <>
            <p className="field-hint">预测框 · [left, top, width, height]</p>
            <code className="ground-truth">
              {JSON.stringify([
                prediction.rect.left,
                prediction.rect.top,
                prediction.rect.width,
                prediction.rect.height,
              ])}
            </code>
          </>
        )}
        {prediction.outcome === 'POINT' && prediction.dpr !== undefined && (
          <p className="field-hint">DPR {prediction.dpr}</p>
        )}
      </details>
      <a
        className="evaluation-json"
        href={result.jsonUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        查看结果 JSON ↗
      </a>
    </section>
  );
}
