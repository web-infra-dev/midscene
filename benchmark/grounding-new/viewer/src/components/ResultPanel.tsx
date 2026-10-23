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
          pending: 'No result',
          error: 'Error',
          passed: 'Passed',
          failed: 'Failed',
        }[status]
      }
    </span>
  );
}

export function ResultPanel({
  evaluationId,
  result,
}: {
  evaluationId: string;
  result: EvaluationResult;
}) {
  const { input, output, profiling } = result;

  return (
    <section
      className="detail-section evaluation-section"
      aria-label="Evaluation result"
    >
      <div className="evaluation-heading">
        <h3>Evaluation result</h3>
      </div>
      <div className="evaluation-summary">
        <ResultStatus result={result} />
        <span>{(profiling.durationMs / 1000).toFixed(2)} s</span>
      </div>
      <dl className="reference-fields evaluation-metadata">
        <div>
          <dt>Evaluation</dt>
          <dd>{evaluationId}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{input.model}</dd>
        </div>
        {profiling.totalTokens !== undefined && (
          <div>
            <dt>Total tokens</dt>
            <dd>{profiling.totalTokens.toLocaleString('en-US')}</dd>
          </div>
        )}
        {profiling.totalCachedInput !== undefined && (
          <div>
            <dt>Cached input tokens</dt>
            <dd>{profiling.totalCachedInput.toLocaleString('en-US')}</dd>
          </div>
        )}
        {profiling.calls !== undefined && (
          <div>
            <dt>Model calls</dt>
            <dd>{profiling.calls}</dd>
          </div>
        )}
        {profiling.totalTimeCostMs !== undefined && (
          <div>
            <dt>Model duration</dt>
            <dd>{(profiling.totalTimeCostMs / 1000).toFixed(2)} s</dd>
          </div>
        )}
      </dl>
      <div className="prediction-value">
        <span className="field-hint">Prediction</span>
        {output.type === 'POINT' ? (
          <code>
            {output.center
              ? `[${output.center.join(', ')}]`
              : 'No prediction coordinates returned'}
          </code>
        ) : (
          <strong>{output.type === 'REFUSAL' ? 'Refusal' : 'Error'}</strong>
        )}
        {output.type === 'POINT' && (
          <span className="field-hint">Original image pixels · [x, y]</span>
        )}
      </div>
      {output.error && <pre className="evaluation-error">{output.error}</pre>}
      <details className="evaluation-snapshot">
        <summary>Instruction and ground truth</summary>
        <p>{input.instruction}</p>
        <p className="field-hint">
          Ground truth at evaluation time · [top, right, bottom, left]
        </p>
        <code className="ground-truth">
          {JSON.stringify(input.groundTruth)}
        </code>
        {output.type === 'POINT' && output.rect && (
          <>
            <p className="field-hint">
              Prediction box · [left, top, width, height]
            </p>
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
          <summary>Model call details</summary>
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
        View result JSON ↗
      </a>
    </section>
  );
}
