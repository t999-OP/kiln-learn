// Service-layer errors carry an HTTP status so routes, the API and MCP can report them uniformly.
export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new ServiceError(404, what);
export const forbidden = (why = "You don't have permission to do that.") => new ServiceError(403, why);
export const invalid = (why: string, details?: unknown) => new ServiceError(400, why, details);
export const conflict = (why: string, details?: unknown) => new ServiceError(409, why, details);
export const unauthorized = (why = "Please sign in.") => new ServiceError(401, why);
