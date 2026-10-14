/** Errors with a stable code and HTTP status, rendered by the API layer. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError("bad_request", message, 400);
export const notFound = (message: string) => new AppError("not_found", message, 404);
export const forbidden = (message: string) => new AppError("forbidden", message, 403);
export const notConfigured = (message: string) => new AppError("not_configured", message, 503);
