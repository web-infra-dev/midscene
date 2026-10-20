import type { TestRunReportError } from '@midscene/core';
import { ReportValue } from './view-primitives';

const hasErrorMetadata = (error: TestRunReportError): boolean =>
  Boolean(error.code || (error.name && error.name !== 'Error'));

export function hasErrorDetails(
  error: TestRunReportError,
  summaryMessage = error.message,
  includeStack = true,
): boolean {
  return Boolean(
    hasErrorMetadata(error) ||
      (includeStack && error.stack) ||
      error.details ||
      error.truncated ||
      (error.cause &&
        (!summaryMessage.includes(error.cause.message) ||
          hasErrorDetails(error.cause, summaryMessage, includeStack))) ||
      (error.errors ?? []).some(
        (child) =>
          !summaryMessage.includes(child.message) ||
          hasErrorDetails(child, summaryMessage),
      ),
  );
}

function collectStackErrors(error: TestRunReportError): TestRunReportError[] {
  const causes = error.cause ? collectStackErrors(error.cause) : [];
  return error.stack ? [...causes, error] : causes;
}

function getErrorContext(error: TestRunReportError) {
  const value = error.details?.value;
  if (
    !error.details ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('node' in value) ||
    typeof value.node !== 'string'
  )
    return { failedNode: undefined, details: error.details };

  const { node, ...remaining } = value;
  const hasRemaining =
    Object.keys(remaining).length > 0 ||
    error.details.redactedPaths?.length ||
    error.details.truncatedPaths?.length;
  return {
    failedNode: node,
    details: hasRemaining ? { ...error.details, value: remaining } : undefined,
  };
}

export function ErrorDetails({
  error,
  hideMessage = false,
  summaryMessage,
  includeStack = true,
}: {
  error: TestRunReportError;
  hideMessage?: boolean;
  summaryMessage?: string;
  includeStack?: boolean;
}): JSX.Element {
  const summary = summaryMessage ?? error.message;
  const { failedNode, details } = getErrorContext(error);
  const stackErrors = includeStack ? collectStackErrors(error) : [];
  const children = (error.errors ?? []).filter(
    (child) =>
      !summary.includes(child.message) || hasErrorDetails(child, summary),
  );
  return (
    <div className="runner-error-detail">
      {hasErrorMetadata(error) || failedNode !== undefined ? (
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
          {failedNode !== undefined ? (
            <div>
              <dt>Failed node</dt>
              <dd>{failedNode}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {!hideMessage ? <p>{error.message}</p> : null}
      {stackErrors.length ? (
        <section
          className="runner-json-block runner-error-stack"
          aria-label="Error stack traces"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable stack panel needs keyboard access.
          tabIndex={0}
        >
          {stackErrors.map((item, index) => (
            <section key={index}>
              <h5>
                {item !== error && index === 0
                  ? 'Original error stack'
                  : item.name === 'NodeExecutionError' && item.cause
                    ? 'Framework stack trace'
                    : item === error
                      ? 'Stack trace'
                      : `${item.name} stack trace`}
              </h5>
              <pre>{item.stack}</pre>
            </section>
          ))}
        </section>
      ) : null}
      {details ? <ReportValue value={details} /> : null}
      {error.truncated ? <p>Error diagnostics were truncated.</p> : null}
      {error.cause &&
      (!summary.includes(error.cause.message) ||
        hasErrorDetails(error.cause, summary, false)) ? (
        <section>
          <h5>Cause</h5>
          <ErrorDetails
            error={error.cause}
            hideMessage={summary.includes(error.cause.message)}
            summaryMessage={summary}
            includeStack={false}
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
