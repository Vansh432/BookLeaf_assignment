import { existsSync } from 'node:fs';
import { z } from 'zod';

// Hosted environments inject variables directly, so a .env file is optional.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // Overrides Node's resolvers when the system DNS refuses the SRV lookups mongodb+srv:// needs.
  DNS_SERVERS: z
    .string()
    .optional()
    .transform((value) => (value ?? '').split(',').map((server) => server.trim()).filter(Boolean)),
  CLIENT_URLS: z
    .string()
    .min(1, 'CLIENT_URLS is required')
    .transform((value) => value.split(',').map((url) => url.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  SEED_AUTHOR_PASSWORD: z.string().min(8).default('Author@123'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin@123'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60),
  // "none" is required when the frontends and API are on different sites (e.g. Vercel + Render).
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: z.stringbool().optional(),
  // Vector size of the chosen embedding model; the vector search index is only created once this is set.
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).max(8192).optional(),
  // Optional: without a key every AI feature falls back to rules, keyword retrieval or manual work.
  GEMINI_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  GEMINI_GENERATION_MODEL: z.string().trim().min(1).default('gemini-3.5-flash-lite'),
  // Drafted replies may justify a stronger (pricier) model than triage; defaults to the generation model.
  GEMINI_DRAFT_MODEL: z.string().trim().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().trim().min(1).default('gemini-embedding-2'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(60000),
  // Attempts per AI call, including the first one; only transient failures are retried.
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  AI_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(1).max(10000).default(500),
  // USD per 1M tokens for each model in use, e.g.
  // {"gemini-3.8-flash":{"input":0.75,"output":3.75,"cachedInput":0.075}}. Prices change, so they live in config.
  AI_PRICING: z
    .string()
    .default('{}')
    .transform((value, context) => {
      try {
        return JSON.parse(value);
      } catch {
        context.addIssue({ code: 'custom', message: 'AI_PRICING must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(
      z.record(
        z.string(),
        z.object({
          input: z.number().nonnegative(),
          output: z.number().nonnegative().default(0),
          cachedInput: z.number().nonnegative().optional(),
        }),
      ),
    ),
  // Per-model requests per minute, kept below the provider quota so bursts queue instead of failing,
  // e.g. {"gemini-3.5-flash-lite":12} for the free tier's 15 RPM. Models not listed are not throttled.
  AI_REQUESTS_PER_MINUTE: z
    .string()
    .default('{}')
    .transform((value, context) => {
      try {
        return JSON.parse(value);
      } catch {
        context.addIssue({ code: 'custom', message: 'AI_REQUESTS_PER_MINUTE must be valid JSON' });
        return z.NEVER;
      }
    })
    .pipe(z.record(z.string(), z.number().int().positive())),
  AI_DAILY_BUDGET_USD: z.coerce.number().nonnegative().default(1),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(10),
  // Triage, summaries and drafts all count; a draft is one generation call (query embeddings are exempt).
  AI_MAX_CALLS_PER_TICKET: z.coerce.number().int().min(1).max(100).default(20),
});

const parsedEnv = envSchema
  .refine((value) => value.JWT_ACCESS_SECRET !== value.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine((value) => value.COOKIE_SAME_SITE !== 'none' || value.COOKIE_SECURE !== false, {
    message: 'COOKIE_SAME_SITE=none requires COOKIE_SECURE=true',
    path: ['COOKIE_SECURE'],
  })
  // Budgets can only be enforced for calls whose cost can be estimated.
  .refine(
    (value) =>
      !value.GEMINI_API_KEY ||
      [value.GEMINI_GENERATION_MODEL, value.GEMINI_DRAFT_MODEL, value.GEMINI_EMBEDDING_MODEL]
        .filter(Boolean)
        .every((model) => value.AI_PRICING[model]),
    {
      message: 'AI_PRICING must include the generation, draft and embedding models when GEMINI_API_KEY is set',
      path: ['AI_PRICING'],
    },
  )
  .safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

const isProduction = parsedEnv.data.NODE_ENV === 'production';

const env = Object.freeze({
  nodeEnv: parsedEnv.data.NODE_ENV,
  isProduction,
  port: parsedEnv.data.PORT,
  mongodbUri: parsedEnv.data.MONGODB_URI,
  dnsServers: parsedEnv.data.DNS_SERVERS,
  clientUrls: parsedEnv.data.CLIENT_URLS,
  logLevel: parsedEnv.data.LOG_LEVEL,
  seedAuthorPassword: parsedEnv.data.SEED_AUTHOR_PASSWORD,
  seedAdminPassword: parsedEnv.data.SEED_ADMIN_PASSWORD,
  jwt: Object.freeze({
    accessSecret: parsedEnv.data.JWT_ACCESS_SECRET,
    refreshSecret: parsedEnv.data.JWT_REFRESH_SECRET,
    accessTtlSeconds: parsedEnv.data.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: parsedEnv.data.JWT_REFRESH_TTL_SECONDS,
  }),
  cookie: Object.freeze({
    sameSite: parsedEnv.data.COOKIE_SAME_SITE,
    secure: parsedEnv.data.COOKIE_SECURE ?? (isProduction || parsedEnv.data.COOKIE_SAME_SITE === 'none'),
  }),
  embeddingDimensions: parsedEnv.data.EMBEDDING_DIMENSIONS ?? null,
  ai: Object.freeze({
    geminiApiKey: parsedEnv.data.GEMINI_API_KEY,
    generationModel: parsedEnv.data.GEMINI_GENERATION_MODEL,
    draftModel: parsedEnv.data.GEMINI_DRAFT_MODEL ?? parsedEnv.data.GEMINI_GENERATION_MODEL,
    embeddingModel: parsedEnv.data.GEMINI_EMBEDDING_MODEL,
    requestTimeoutMs: parsedEnv.data.AI_REQUEST_TIMEOUT_MS,
    maxAttempts: parsedEnv.data.AI_MAX_ATTEMPTS,
    retryBaseDelayMs: parsedEnv.data.AI_RETRY_BASE_DELAY_MS,
    pricing: parsedEnv.data.AI_PRICING,
    requestsPerMinute: parsedEnv.data.AI_REQUESTS_PER_MINUTE,
    dailyBudgetUsd: parsedEnv.data.AI_DAILY_BUDGET_USD,
    monthlyBudgetUsd: parsedEnv.data.AI_MONTHLY_BUDGET_USD,
    maxCallsPerTicket: parsedEnv.data.AI_MAX_CALLS_PER_TICKET,
  }),
});

export default env;
