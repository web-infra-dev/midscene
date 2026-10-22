import type { EvaluationResult } from '../types';

export function ResultStatus({ result }: { result?: EvaluationResult }) {
  const status = !result
    ? 'pending'
    : result.output.type === 'ERROR'
      ? 'error'
      : result.output.correct
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
  const { input, output, profiling } = result;

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
        <span>{(profiling.durationMs / 1000).toFixed(2)} s</span>
      </div>
      <dl className="reference-fields evaluation-metadata">
        <div>
          <dt>Run</dt>
          <dd>{runId}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{input.model}</dd>
        </div>
        {profiling.totalTokens !== undefined && (
          <div>
            <dt>Tokens</dt>
            <dd>{profiling.totalTokens.toLocaleString()}</dd>
          </div>
        )}
        {profiling.totalCachedInput !== undefined && (
          <div>
            <dt>缓存输入</dt>
            <dd>{profiling.totalCachedInput.toLocaleString()}</dd>
          </div>
        )}
        {profiling.calls !== undefined && (
          <div>
            <dt>模型调用</dt>
            <dd>{profiling.calls}</dd>
          </div>
        )}
        {profiling.totalTimeCostMs !== undefined && (
          <div>
            <dt>模型耗时</dt>
            <dd>{(profiling.totalTimeCostMs / 1000).toFixed(2)} s</dd>
          </div>
        )}
      </dl>
      <div className="prediction-value">
        <span className="field-hint">模型预测</span>
        {output.type === 'POINT' ? (
          <code>
            {output.center ? `[${output.center.join(', ')}]` : '未返回预测坐标'}
          </code>
        ) : (
          <strong>{output.type === 'REFUSAL' ? '拒识' : '执行异常'}</strong>
        )}
        {output.type === 'POINT' && (
          <span className="field-hint">原图像素坐标 · [x, y]</span>
        )}
      </div>
      {output.error && <pre className="evaluation-error">{output.error}</pre>}
      <details className="evaluation-snapshot">
        <summary>执行指令与标注</summary>
        <p>{input.instruction}</p>
        <p className="field-hint">
          运行时 Ground Truth · [top, right, bottom, left]
        </p>
        <code className="ground-truth">
          {JSON.stringify(input.groundTruth)}
        </code>
        {output.type === 'POINT' && output.rect && (
          <>
            <p className="field-hint">预测框 · [left, top, width, height]</p>
            <code className="ground-truth">
              {JSON.stringify([
                output.rect.left,
                output.rect.top,
                output.rect.width,
                output.rect.height,
              ])}
            </code>
          </>
        )}
        {output.type === 'POINT' && output.dpr !== undefined && (
          <p className="field-hint">DPR {output.dpr}</p>
        )}
      </details>
      {(profiling.byIntent || profiling.byModel) && (
        <details className="evaluation-snapshot">
          <summary>模型调用明细</summary>
          <pre>
            {JSON.stringify(
              { byIntent: profiling.byIntent, byModel: profiling.byModel },
              null,
              2,
            )}
          </pre>
        </details>
      )}
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
