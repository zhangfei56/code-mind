const RETRY_INITIAL_DELAY_MS = 1_000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_DELAY_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 45_000;

export interface RetryContext {
  attempt: number;
  maxAttempts: number;
}

export class ModelRequestError extends Error {
  constructor(
    message: string,
    readonly options: {
      retryable: boolean;
      statusCode?: number;
      nextDelayMs?: number;
      code?: string;
    },
  ) {
    super(message);
    this.name = "ModelRequestError";
  }
}

export function getDefaultTimeoutMs(): number {
  const override = Number.parseInt(process.env.AGENT_MODEL_TIMEOUT_MS ?? "", 10);
  if (Number.isInteger(override) && override > 0) {
    return override;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function getDefaultMaxAttempts(): number {
  return DEFAULT_MAX_ATTEMPTS;
}

export function shouldRetry(error: unknown, context: RetryContext): error is ModelRequestError {
  return (
    error instanceof ModelRequestError &&
    error.options.retryable &&
    context.attempt < context.maxAttempts
  );
}

export function getRetryDelayMs(
  error: ModelRequestError,
  attempt: number,
): number {
  if (error.options.nextDelayMs !== undefined) {
    return error.options.nextDelayMs;
  }

  return Math.min(
    RETRY_INITIAL_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, Math.max(attempt - 1, 0)),
    RETRY_MAX_DELAY_MS,
  );
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAbortSignal(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Model request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    },
  };
}

export function combineAbortSignals(
  primary: AbortSignal,
  secondary?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!secondary) {
    return { signal: primary, cleanup: () => undefined };
  }

  const controller = new AbortController();
  const forwardPrimary = () => controller.abort(primary.reason);
  const forwardSecondary = () => controller.abort(secondary.reason);

  if (primary.aborted) {
    controller.abort(primary.reason);
  } else {
    primary.addEventListener("abort", forwardPrimary, { once: true });
  }

  if (secondary.aborted) {
    controller.abort(secondary.reason);
  } else {
    secondary.addEventListener("abort", forwardSecondary, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      primary.removeEventListener("abort", forwardPrimary);
      secondary.removeEventListener("abort", forwardSecondary);
    },
  };
}

export async function buildHttpError(response: Response): Promise<ModelRequestError> {
  const bodyText = await response.text();
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterMsHeader = response.headers.get("retry-after-ms");
  const nextDelayMs = parseRetryAfter(retryAfterMsHeader, retryAfterHeader);
  const retryable = response.status === 429 || response.status >= 500;

  return new ModelRequestError(
    `Model request failed: ${response.status} ${bodyText}`,
    {
      retryable,
      statusCode: response.status,
      ...(nextDelayMs === undefined ? {} : { nextDelayMs }),
    },
  );
}

export function buildNetworkError(error: unknown): ModelRequestError {
  const message =
    error instanceof Error ? error.message : "Model request failed.";

  return new ModelRequestError(message, {
    retryable: true,
    code: error instanceof Error ? error.name : "network_error",
  });
}

function parseRetryAfter(
  retryAfterMsHeader: string | null,
  retryAfterHeader: string | null,
): number | undefined {
  if (retryAfterMsHeader) {
    const parsed = Number.parseFloat(retryAfterMsHeader);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, RETRY_MAX_DELAY_MS);
    }
  }

  if (!retryAfterHeader) {
    return undefined;
  }

  const seconds = Number.parseFloat(retryAfterHeader);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(Math.ceil(seconds * 1_000), RETRY_MAX_DELAY_MS);
  }

  const deltaMs = Date.parse(retryAfterHeader) - Date.now();
  if (!Number.isNaN(deltaMs) && deltaMs > 0) {
    return Math.min(deltaMs, RETRY_MAX_DELAY_MS);
  }

  return undefined;
}
