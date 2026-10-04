import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 32 bytes of hex (64 characters)"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export const env = envSchema.parse(process.env);
