export interface ErrorDescription {
  message: string;
  code?: string;
  category?: string;
  stage?: string;
  status?: number;
  details?: unknown;
  next?: string;
  cause?: ErrorDescription;
}

/** Keep CLI feedback and saved verification failures equally actionable. */
export function verificationError(
  code: string,
  diagnostic: {
    stage: string;
    reason: string;
    details: Record<string, unknown>;
    next: string;
    category?: string;
  },
) {
  const { stage, reason, details, next, category } = diagnostic;
  return Object.assign(
    new Error(
      `${code}: ${reason}\nStage: ${stage}\n${JSON.stringify(details, null, 2)}\nNext: ${next}`,
    ),
    { code, stage, details, next, category },
  );
}

export function describeError(
  error: unknown,
  stage?: string,
): ErrorDescription {
  const detail = error as {
    code?: string;
    category?: string;
    stage?: string;
    details?: unknown;
    next?: string;
    status?: number;
  };
  return {
    message: String(error),
    code: detail?.code,
    category: detail?.category,
    stage: stage ?? detail?.stage,
    status: detail?.status,
    details: detail?.details,
    next: detail?.next,
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: describeError(error.cause) }
      : {}),
  };
}
