import type { EvaluationResult } from '../types';

export function ResultStatus({ result }: { result?: EvaluationResult }) {
  const [status, text] = !result
    ? ['pending', 'No result']
    : result.output.type === 'ERROR'
      ? ['error', 'Error']
      : result.output.correct
        ? ['passed', 'Passed']
        : ['failed', 'Failed'];
  return <span className={`evaluation-status ${status}`}>{text}</span>;
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
      aria-label="Evaluation Result"
    >
      <h3 className="evaluation-heading">Evaluation Result</h3>
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
          <dd>{input.displayName ?? input.model}</dd>
        </div>
        {[
          ['Total Tokens', profiling.totalTokens?.toLocaleString('en-US')],
          [
            'Cached Input Tokens',
            profiling.totalCachedInput?.toLocaleString('en-US'),
          ],
          ['Model Calls', profiling.calls],
          [
            'Model Duration',
            profiling.totalTimeCostMs === undefined
              ? undefined
              : `${(profiling.totalTimeCostMs / 1000).toFixed(2)} s`,
          ],
        ].map(
          ([label, value]) =>
            value !== undefined && (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
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
        <summary>Instruction and Ground Truth</summary>
        <p>{input.instruction}</p>
        <p className="field-hint">
          Ground Truth at Evaluation Time · [top, right, bottom, left]
        </p>
        <code className="ground-truth">
          {JSON.stringify(input.groundTruth)}
        </code>
        {output.type === 'POINT' && output.rect && (
          <>
            <p className="field-hint">
              Prediction Box · [left, top, width, height]
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
          <summary>Model Call Details</summary>
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
