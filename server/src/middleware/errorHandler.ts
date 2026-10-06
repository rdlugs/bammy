import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { HttpError } from "../lib/httpError.ts";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: z.flattenError(err).fieldErrors,
    });
    return;
  }
  // body-parser's own error for a body over a route's limit.
  if (err instanceof Error && "type" in err && err.type === "entity.too.large") {
    res.status(413).json({ message: "The upload is too large" });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json(err.errors ? { message: err.message, errors: err.errors } : { message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}
