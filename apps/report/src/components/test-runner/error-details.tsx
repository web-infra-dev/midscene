import type { TestRunReportError } from '@midscene/core';
import { ReportValue } from './view-primitives';

export function ErrorDetails({
  error,
}: { error: TestRunReportError }): JSX.Element {
  return (
    <div>
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{error.name}</dd>
        </div>
        {error.code ? (
          <div>
            <dt>Code</dt>
            <dd>{error.code}</dd>
          </div>
        ) : null}
      </dl>
      <p>{error.message}</p>
      {error.details ? <ReportValue value={error.details} /> : null}
      {error.truncated ? (
        <p>Error details or cause chain were truncated.</p>
      ) : null}
      {error.cause ? (
        <details>
          <summary>Cause</summary>
          <ErrorDetails error={error.cause} />
        </details>
      ) : null}
      {error.errors?.length ? (
        <details>
          <summary>Related errors ({error.errors.length})</summary>
          {error.errors.map((item, index) => (
            <ErrorDetails key={index} error={item} />
          ))}
        </details>
      ) : null}
    </div>
  );
}
