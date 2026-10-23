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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}

const env = Object.freeze({
  nodeEnv: parsedEnv.data.NODE_ENV,
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  port: parsedEnv.data.PORT,
  mongodbUri: parsedEnv.data.MONGODB_URI,
  clientUrls: parsedEnv.data.CLIENT_URLS,
  logLevel: parsedEnv.data.LOG_LEVEL,
});

export default env;
