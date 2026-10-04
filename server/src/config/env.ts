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
  // GitHub App. All optional: without them GitHub connections are unavailable.
  GITHUB_HOST: z.string().default("github.com"),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  // PEM; a single-line value with literal \n escapes (as .env files need) is accepted.
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((key) => key?.replace(/\\n/g, "\n")),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  // Where forges can reach this API, for the webhook URL registered on GitLab.
  API_PUBLIC_URL: z.string().url().default("http://localhost:4000"),
  // Server-wide model keys, used when the repository owner has not stored one.
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  // Running reviews one user may have at once, so one busy account cannot
  // take every worker slot.
  WORKER_USER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export const env = envSchema.parse(process.env);
