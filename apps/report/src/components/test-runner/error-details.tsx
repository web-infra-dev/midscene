import type { TestRunReportError } from '@midscene/core';
import { ReportValue } from './view-primitives';

const hasErrorMetadata = (error: TestRunReportError): boolean =>
  Boolean(error.code || (error.name && error.name !== 'Error'));

export function hasErrorDetails(
  error: TestRunReportError,
  summaryMessage = error.message,
): boolean {
  return Boolean(
    hasErrorMetadata(error) ||
      error.stack ||
      error.details ||
      error.truncated ||
      [error.cause, ...(error.errors ?? [])].some(
        (child) =>
          child &&
          (!summaryMessage.includes(child.message) ||
            hasErrorDetails(child, summaryMessage)),
      ),
  );
}

export function ErrorDetails({
  error,
  hideMessage = false,
  summaryMessage,
}: {
  error: TestRunReportError;
  hideMessage?: boolean;
  summaryMessage?: string;
}): JSX.Element {
  const summary = summaryMessage ?? error.message;
  const children = (error.errors ?? []).filter(
    (child) =>
      !summary.includes(child.message) || hasErrorDetails(child, summary),
  );
  return (
    <div className="runner-error-detail">
      {hasErrorMetadata(error) ? (
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
      ) : null}
      {!hideMessage ? <p>{error.message}</p> : null}
      {error.stack ? (
        <section>
          <h5>Stack trace</h5>
          <div className="runner-json-block">
            <pre>{error.stack}</pre>
          </div>
        </section>
      ) : null}
      {error.details ? <ReportValue value={error.details} /> : null}
      {error.truncated ? <p>Error diagnostics were truncated.</p> : null}
      {error.cause &&
      (!summary.includes(error.cause.message) ||
        hasErrorDetails(error.cause, summary)) ? (
        <section>
          <h5>Cause</h5>
          <ErrorDetails
            error={error.cause}
            hideMessage={summary.includes(error.cause.message)}
            summaryMessage={summary}
          />
        </section>
      ) : null}
      {children.length ? (
        <section>
          <h5>Related errors ({children.length})</h5>
          {children.map((item, index) => (
            <ErrorDetails
              key={index}
              error={item}
              hideMessage={summary.includes(item.message)}
              summaryMessage={summary}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
