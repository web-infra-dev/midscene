import {
  type EvaluationResult,
  resultStatus,
  resultStatusLabel,
} from '../types';

export function ResultStatus({ result }: { result?: EvaluationResult }) {
  const status = resultStatus(result);
  return (
    <span
      className={`evaluation-status ${status === 'missing' ? 'pending' : status}`}
    >
      {resultStatusLabel(result)}
    </span>
  );
}

function Usage({ profiling }: { profiling: EvaluationResult['profiling'] }) {
  return (
    <dl className="reference-fields evaluation-metadata">
      {[
        ['Input Tokens', profiling.totalPromptTokens?.toLocaleString('en-US')],
        [
          'Output Tokens',
          profiling.totalCompletionTokens?.toLocaleString('en-US'),
        ],
        ['Total Tokens', profiling.totalTokens?.toLocaleString('en-US')],
        [
          'Cached Input Tokens',
          profiling.totalCachedInput?.toLocaleString('en-US'),
        ],
        ['Model Calls', profiling.calls],
        ['Measured Duration', `${(profiling.durationMs / 1000).toFixed(2)} s`],
        [
          'Model Duration',
          profiling.totalTimeCostMs === undefined
            ? undefined
            : `${(profiling.totalTimeCostMs / 1000).toFixed(2)} s`,
        ],
        ['Usage Coverage', profiling.usageStatus],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
      {profiling.usageNote && (
        <div>
          <dt>Usage Note</dt>
          <dd>{profiling.usageNote}</dd>
        </div>
      )}
    </dl>
  );
}

function Output({ output }: { output: EvaluationResult['output'] }) {
  return (
    <>
      <div className="prediction-value">
        <span className="field-hint">Prediction</span>
        {output.type === 'POINT' ? (
          <>
            <code>[{output.center?.join(', ')}]</code>
            <span className="field-hint">Original image pixels · [x, y]</span>
            {output.rect && (
              <>
                <span className="field-hint">
                  Box · [left, top, width, height]
                </span>
                <code>
                  [
                  {[
                    output.rect.left,
                    output.rect.top,
                    output.rect.width,
                    output.rect.height,
                  ].join(', ')}
                  ]
                </code>
              </>
            )}
            {output.dpr !== undefined && (
              <span className="field-hint">DPR {output.dpr}</span>
            )}
          </>
        ) : (
          <strong>{output.type === 'REFUSAL' ? 'Refusal' : 'Error'}</strong>
        )}
      </div>
      {output.error && (
        <pre className="evaluation-error">
          {output.error.name}
          {output.error.code ? ` (${output.error.code})` : ''}:{' '}
          {output.error.message}
          {'\n'}Retryable: {output.error.retryable ? 'Yes' : 'No'}
        </pre>
      )}
    </>
  );
}

export function ResultPanel({
  model,
  result,
}: { model?: string; result?: EvaluationResult }) {
  return (
    <section
      className="detail-section evaluation-section"
      aria-label="Evaluation Result"
    >
      <h3 className="evaluation-heading">Evaluation Result</h3>
      <div className="evaluation-summary">
        <ResultStatus result={result} />
        {result && (
          <span>{(result.profiling.durationMs / 1000).toFixed(2)} s</span>
        )}
      </div>
      <dl className="reference-fields evaluation-metadata">
        <div>
          <dt>Model</dt>
          <dd>{model ?? '—'}</dd>
        </div>
      </dl>
      {result ? (
        <>
          <Usage profiling={result.profiling} />
          <Output output={result.output} />
          <details className="evaluation-snapshot">
            <summary>Instruction and Ground Truth</summary>
            <p>{result.input.instruction}</p>
            <p className="field-hint">
              Ground Truth at Evaluation Time · [top, right, bottom, left]
            </p>
            <code className="ground-truth">
              {JSON.stringify(result.input.groundTruth)}
            </code>
            <p className="field-hint">Testcase SHA-256</p>
            <code className="ground-truth">
              {result.consistency.testcaseSha256}
            </code>
          </details>
          <details className="evaluation-snapshot" id="result-attempts">
            <summary>Attempts ({result.attempts.length})</summary>
            {result.attempts.map((attempt, index) => (
              <section
                className="attempt-result"
                key={`${index}-${attempt.profiling.durationMs}`}
              >
                <h4>
                  Attempt {index + 1} ·{' '}
                  {attempt.output.type === 'ERROR'
                    ? 'Error'
                    : attempt.output.correct
                      ? 'Passed'
                      : 'Failed'}
                </h4>
                <Usage profiling={attempt.profiling} />
                <Output output={attempt.output} />
              </section>
            ))}
          </details>
          <details className="evaluation-snapshot">
            <summary>Result JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p className="field-hint no-result-explanation">
          No result was recorded for this model and testcase. Missing results
          are excluded from scores.
        </p>
      )}
    </section>
  );
}
