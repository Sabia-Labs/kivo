/**
 * Consistent JSON response envelope for all API responses.
 * Shape: { data, error, meta }
 */

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

export interface ApiError {
  message: string;
  issues?: unknown;
}

export interface ApiMeta {
  timestamp: string;
}

/** Build a success response envelope. */
export function success<T>(data: T): ApiResponse<T> {
  return {
    data,
    error: null,
    meta: { timestamp: new Date().toISOString() },
  };
}

/** Build an error response envelope. */
export function failure(message: string, issues?: unknown): ApiResponse<null> {
  return {
    data: null,
    error: { message, issues },
    meta: { timestamp: new Date().toISOString() },
  };
}
