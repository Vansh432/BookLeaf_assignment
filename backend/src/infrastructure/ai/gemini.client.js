import { GoogleGenAI } from '@google/genai';
import env from '../../config/env.js';

let client = null;

export const isAiConfigured = () => Boolean(env.ai.geminiApiKey);

// Created lazily so the app (and scripts) run without a key; callers check isAiConfigured first.
// The SDK's own retries are left off: they ignore Retry-After, so the AI gateway retries instead.
export const getGeminiClient = () => {
  if (!isAiConfigured()) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  client ??= new GoogleGenAI({ apiKey: env.ai.geminiApiKey });

  return client;
};
