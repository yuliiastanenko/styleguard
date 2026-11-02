export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// timeouts, rate limits and 5xx are worth another try, bad input or a missing key is not
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof Error)) return true;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  if (/is not set$/.test(e.message)) return false;

  const status = (e as { status?: unknown }).status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  return true;
}

export function errorMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1000);
}
