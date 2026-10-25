// Loaded with `node --import` before any test module, so these values win over backend/.env
// (process.loadEnvFile never overrides variables that are already set). Tests therefore never touch
// the Atlas database or the real Gemini key; provider calls are mocked.
const testEnv = {
  NODE_ENV: 'test',
  MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/bookleaf_test',
  DNS_SERVERS: '',
  CLIENT_URLS: 'http://localhost:5173',
  LOG_LEVEL: 'error',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-at-least-32-characters',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-at-least-32-characters',
  GEMINI_API_KEY: 'test-key',
  GEMINI_GENERATION_MODEL: 'test-flash',
  GEMINI_EMBEDDING_MODEL: 'test-embedding',
  EMBEDDING_DIMENSIONS: '4',
  AI_PRICING: JSON.stringify({
    'test-flash': { input: 1, output: 4, cachedInput: 0.1 },
    'test-embedding': { input: 0.5 },
  }),
  // Only a dedicated model is throttled, so the limiter can be tested without slowing other tests.
  AI_REQUESTS_PER_MINUTE: JSON.stringify({ 'test-throttled': 2 }),
  AI_DAILY_BUDGET_USD: '1',
  AI_MONTHLY_BUDGET_USD: '5',
  AI_MAX_CALLS_PER_TICKET: '3',
  AI_MAX_ATTEMPTS: '3',
  AI_RETRY_BASE_DELAY_MS: '1',
  AI_REQUEST_TIMEOUT_MS: '1000',
};

Object.assign(process.env, testEnv);
