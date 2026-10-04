export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    // Per-field messages, shaped like a ZodError's so the client maps them onto form fields.
    public errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}
