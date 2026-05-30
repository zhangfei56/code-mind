export class RunAbortedError extends Error {
  constructor(message = "Run aborted.") {
    super(message);
    this.name = "RunAbortedError";
  }
}

export function isRunAbortedError(error: unknown): boolean {
  return error instanceof RunAbortedError;
}

export async function waitWithAbortSignal<T>(
  promise: Promise<T>,
  abortSignal?: AbortSignal,
  message = "Run aborted.",
): Promise<T> {
  if (!abortSignal) {
    return promise;
  }
  if (abortSignal.aborted) {
    throw new RunAbortedError(message);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      abortSignal.removeEventListener("abort", onAbort);
      reject(new RunAbortedError(message));
    };
    abortSignal.addEventListener("abort", onAbort);
    promise.then(
      (value) => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        abortSignal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
