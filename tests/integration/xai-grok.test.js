/**
 * Live integration tests against xAI Grok (OpenAI-compatible API).
 * Skips automatically when XAI_API_KEY is not set (e.g. CI without secrets).
 *
 * Run: npm run test:grok
 * Or:  npx jest tests/integration/xai-grok.test.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const OpenAI = require('openai');

const XAI_BASE_URL = 'https://api.x.ai/v1';
const GROK_MODEL = 'grok-4-1-fast-non-reasoning';

const hasKey = Boolean(process.env.XAI_API_KEY && String(process.env.XAI_API_KEY).trim().length > 0);

const describeGrok = hasKey ? describe : describe.skip;

describeGrok('xAI Grok (live API)', () => {
  test('chat.completions returns non-empty content from grok-4-1-fast-non-reasoning', async () => {
    const client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: XAI_BASE_URL
    });

    const response = await client.chat.completions.create({
      model: GROK_MODEL,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }]
    });

    const text = response.choices[0]?.message?.content;
    expect(typeof text).toBe('string');
    expect(text.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
