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
});

export default env;
