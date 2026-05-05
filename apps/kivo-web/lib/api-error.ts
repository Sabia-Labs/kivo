/**
 * Extracts a human-readable error string from an API response error.
 *
 * The Kivo API always returns errors as objects: { message: string, issues?: unknown }
 * Passing an object directly to toast.error() causes a React "Objects are not valid
 * as a React child" crash. Always use this helper instead of `data.error` directly.
 *
 * @example
 *   toast.error(apiErrorMessage(data.error, "Fallback message"));
 */
export function apiErrorMessage(
  error: unknown,
  fallback = "An unexpected error occurred."
): string {
  if (!error) return fallback;
  if (typeof error === "string") return error || fallback;
  if (typeof error === "object" && "message" in error) {
    const msg = (error as { message: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}
