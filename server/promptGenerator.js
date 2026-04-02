const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Anthropic SDK for AI-powered prompt generation
const Anthropic = require('@anthropic-ai/sdk').default;
// OpenAI-compatible client used for xAI
const OpenAI = require('openai');

// Config module for API key management
const config = require('./config');

// Import Last Wit modes
const { LAST_WIT_MODES } = require('../shared/constants');

// Helper to get the base path for assets (works with pkg bundled apps)
function getBasePath() {
  // When bundled with pkg, __dirname points to snapshot filesystem
  // Assets are included via pkg assets config
  return path.dirname(__dirname);
}

// Load templates from JSON file
function loadTemplates() {
  const basePath = getBasePath();
  const templatesPath = path.join(basePath, 'prompts', 'templates.json');
  return JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
}

// Load adult templates separately
function loadAdultTemplates() {
  const basePath = getBasePath();
  const adultTemplatesPath = path.join(basePath, 'prompts', 'adult-templates.json');
  try {
    return JSON.parse(fs.readFileSync(adultTemplatesPath, 'utf8'));
  } catch (error) {
    console.warn('Adult templates not found, falling back to standard:', error.message);
    return { templates: [], fillWords: {} };
  }
}

const promptData = loadTemplates();
const adultPromptData = loadAdultTemplates();

/** Max themes from host input; max chars per segment; max raw input length */
const MAX_THEMES = 6;
const MAX_THEME_SEGMENT_LEN = 40;
const MAX_THEME_INPUT_LEN = 360;

const THEME_STOPWORDS = new Set([
  'and', 'or', 'the', 'a', 'an', 'for', 'of', 'in', 'on', 'at', 'to', 'as', 'by'
]);

/**
 * Parse host theme field into a deduped list of theme strings, or null if empty.
 * @param {string|null|undefined} raw
 * @returns {string[]|null}
 */
function parseThemes(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const trimmed = raw.trim().substring(0, MAX_THEME_INPUT_LEN);
  if (!trimmed) return null;
  const parts = trimmed.split(/[,;\n\r]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const seg = p.length > MAX_THEME_SEGMENT_LEN ? p.substring(0, MAX_THEME_SEGMENT_LEN).trim() : p;
    if (!seg) continue;
    const key = seg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(seg);
    if (out.length >= MAX_THEMES) break;
  }
  return out.length ? out : null;
}

/**
 * Build batches of prompts per theme label, one bucket per theme (round-robin split).
 * @param {number} count
 * @param {string[]} themes
 * @returns {{ label: string, count: number }[]}
 */
function buildThemeLabelBuckets(count, themes) {
  const buckets = [];
  if (!themes || themes.length === 0) return buckets;
  if (themes.length === 1) {
    buckets.push({ label: themes[0], count });
    return buckets;
  }

  const perTheme = new Map();
  themes.forEach(t => perTheme.set(t, 0));
  for (let i = 0; i < count; i++) {
    const t = themes[i % themes.length];
    perTheme.set(t, perTheme.get(t) + 1);
  }
  for (const [label, c] of perTheme) {
    if (c > 0) buckets.push({ label, count: c });
  }
  return buckets;
}

/**
 * Pick a random single theme label for Last Wit.
 * @param {string[]|null|undefined} themes
 * @returns {{ label: string|null }}
 */
function pickRandomThemeLabel(themes) {
  if (!themes || themes.length === 0) {
    return { label: null };
  }
  return { label: themes[Math.floor(Math.random() * themes.length)] };
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {string[]|string|null|undefined} themeOrThemes
 * @returns {string[]|null}
 */
function normalizeThemesArg(themeOrThemes) {
  if (themeOrThemes == null) return null;
  if (Array.isArray(themeOrThemes)) {
    return themeOrThemes.length ? themeOrThemes : null;
  }
  if (typeof themeOrThemes === 'string' && themeOrThemes.trim()) {
    return [themeOrThemes.trim()];
  }
  return null;
}

// Lazy-initialized AI clients
let anthropicClient = null;
let xaiClient = null;

// Model identifiers
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const XAI_MODEL = 'grok-4-1-fast-non-reasoning';

function getAnthropicClient() {
  const apiKey = config.getAnthropicApiKey() || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    anthropicClient = null;
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function getXaiClient() {
  const apiKey = config.getXaiApiKey() || process.env.XAI_API_KEY;
  if (!apiKey) {
    xaiClient = null;
    return null;
  }
  if (!xaiClient) {
    xaiClient = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  }
  return xaiClient;
}

/**
 * Return the active AI client based on the configured provider.
 * Returns null if the active provider has no key configured.
 */
function getActiveClient() {
  const provider = config.getActiveProvider();
  if (provider === config.PROVIDERS.XAI) {
    return getXaiClient();
  }
  return getAnthropicClient();
}

/**
 * Reinitialize all AI clients (call after API key/provider changes)
 */
function reinitializeClient() {
  anthropicClient = null;
  xaiClient = null;
  return getActiveClient();
}

/**
 * Unified AI message call that normalizes Anthropic vs xAI (OpenAI-compat) APIs.
 * @param {object} opts
 * @param {string} opts.system - System prompt text
 * @param {string} opts.userContent - User message content
 * @param {number} opts.maxTokens - Max tokens to generate
 * @returns {Promise<string>} Generated text
 */
async function callAI({ system, userContent, maxTokens }) {
  const provider = config.getActiveProvider();

  if (provider === config.PROVIDERS.XAI) {
    const client = getXaiClient();
    if (!client) throw new Error('xAI client not initialized - check XAI_API_KEY');
    const response = await client.chat.completions.create({
      model: XAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent }
      ]
    });
    return response.choices[0].message.content;
  }

  // Default: Anthropic
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic client not initialized - check ANTHROPIC_API_KEY');
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userContent }],
    system
  });
  return message.content[0].text;
}

// Base system prompt for AI-generated prompts (no theme)
const AI_SYSTEM_PROMPT_BASE = `You are a hilarious comedy writer for an adult QuipLash-style party game. Your job is to generate funny, edgy, and entertaining fill-in-the-blank style prompts for a group of adult friends.

Guidelines:
- Prompts should be open-ended enough for creative, hilarious answers
- This is for ADULTS at a game night - be funny, edgy, and a bit raunchy
- Topics can span ANY area of life: work, relationships, food, travel, money, health, technology, nature, sports, school, family, aging, animals, hobbies, crime, politics, science, history, religion, fashion, weather, parenting, childhood memories, nightlife, embarrassing moments, bodily functions, and more
- Make them absurd, surprising, provocative, or set up hilariously uncomfortable situations
- Sexual innuendos and suggestive content are encouraged (but avoid explicit/graphic content)
- Format: A statement or question that players complete with their answer
- Keep prompts concise (under 100 characters ideally)
- DO NOT default to movies, TV shows, celebrities, or pop culture franchises — those are only used when the host picks a specific theme. Keep prompts grounded in everyday life and universal human experiences.
- Maximize variety: avoid repeating the same topic, setting, or format across prompts in a batch

Example prompts:
- "The worst thing to whisper in someone's ear on a first date"
- "What your Uber driver is secretly thinking about you"
- "The real reason your ex keeps texting at 2am"
- "A terrible name for a strip club"
- "Something that sounds dirty but isn't"
- "The worst pickup line that would actually work on you"
- "What your browser history says about you"
- "The most embarrassing thing to yell during sex"
- "A bad excuse for why you're late to work... again"
- "What your therapist writes in their notes about you"
- "The worst thing to find in your carry-on at airport security"
- "What your dog is actually barking at"
- "A terrible reason to call an ambulance"
- "The worst thing to google right before a job interview"
- "Something you shouldn't say at Thanksgiving dinner"

Generate creative, original, adult-oriented prompts in a similar style. Vary the topics widely — no two prompts in a batch should feel like they come from the same corner of life.`;

// Adult mode system prompt - well-rounded like Cards Against Humanity
// Allows edgy/sexual content but does not require every prompt to be sexual
const ADULT_SYSTEM_PROMPT = `You are a hilarious comedy writer for an adult party game like Cards Against Humanity or Quiplash. Generate funny, edgy, provocative, cringe-worthy, dark, and taboo fill-in-the-blank prompts.

Guidelines for ADULT MODE:
- Draw from ANY area of life: relationships, work, family, money, travel, food, health, aging, animals, childhood, parenting, crime, religion, sports, nature, technology, history, nightlife, bodily functions, embarrassing moments, and more
- Not every prompt needs to be sexual. Variety across many topics is key for a fun, well-rounded game
- Be crude, vulgar, offensive, shocking, or hilariously uncomfortable when it fits
- Make prompts that will make players laugh, blush, gasp, or groan
- Keep prompts concise (under 100 characters ideally) but punchy and memorable
- Format: A statement or question that players complete with their funniest answer
- DO NOT default to movies, TV shows, celebrities, or pop culture franchises — those are only used when the host picks a specific theme. Ground prompts in everyday life and universal human experiences.
- Maximize variety: avoid repeating the same topic, setting, or format across prompts in a batch

Example prompts:
- "The worst thing to moan during sex with your boss"
- "Something you shouldn't do with a family member at Thanksgiving"
- "A terrible safe word that would ruin the mood"
- "The most awkward thing to have in your search history"
- "What your therapist really thinks about your sex life"
- "The worst text to accidentally send to your mom"
- "Something that sounds dirty but is actually about your job"
- "The last thing you want to hear from your dentist mid-procedure"
- "A terrible reason to request bereavement leave"
- "What the neighbors definitely heard last night"

Generate creative, entertaining, boundary-pushing prompts with good variety across as many different topics as possible.`;

/**
 * Get AI system prompt, building a theme-focused prompt when a theme is provided
 * When themed, the entire prompt is rewritten to prioritize the theme's universe,
 * characters, and humor style over generic adult party game content.
 * @param {string|null} theme - Optional theme to incorporate into prompts
 * @returns {string} The system prompt for AI generation
 */
function getAISystemPrompt(theme = null, isAdult = false) {
  if (isAdult) {
    return ADULT_SYSTEM_PROMPT;
  }
  
  if (!theme) {
    return AI_SYSTEM_PROMPT_BASE;
  }
  
  // When a theme is provided, build a theme-focused prompt centered on that topic
  return `You are a hilarious comedy writer for a QuipLash-style party game. Your job is to generate funny, creative fill-in-the-blank style prompts inspired by the theme: "${theme}"

SIMPLICITY FIRST:
- Prompts must be IMMEDIATELY understandable - players should "get it" on first read
- Keep it simple and clear - use everyday situations, humor, and ideas that naturally connect to "${theme}"
- The humor should be straightforward and funny, accessible to anyone who knows what "${theme}" is
- Treat "${theme}" as a topic or setting to riff on, not as a franchise with characters to name-drop

Guidelines:
- Prompts should be open-ended enough for creative, hilarious answers
- Format: A statement or question that players complete with their answer
- Keep prompts concise (under 100 characters ideally)
- Make them funny, surprising, and connected to "${theme}" in a way that's easy to understand
- Prioritize clarity and immediate comprehension over obscure references
- ALWAYS generate actual prompts - never explain why you can't or refuse. Create fun, appropriate prompts.

Examples of GOOD themed prompts (topic-driven, not franchise name-drops):
- For "cooking": "The worst thing to say to a chef right before they plate your food"
- For "sports": "What a coach screams when they're absolutely losing it"
- For "camping": "The worst thing to forget on a camping trip"
- For "dating": "The red flag you ignored on a first date"
- For "dentists": "The last thing you want to hear while someone is drilling your tooth"
- For "airports": "What the TSA agent is silently judging you for"
- For "pets": "What your dog is actually barking at 3am"

Examples of BAD themed prompts (too generic or not tied to the theme):
- "What [character] does on a first date" (uses a character name-drop instead of the theme)
- "A person's embarrassing moment" (no connection to the theme at all)
- "The worst thing ever" (completely unanchored)

Generate prompts that are fun, funny, and instantly understandable. Root them in the everyday situations, humor, and experiences that surround "${theme}". Always return actual prompts, never explanations or refusals.`;
}

/**
 * Generate a prompt by filling in a template with random words
 */
function generatePrompt(template, fillWords) {
  let prompt = template;
  
  // Find all placeholders like {noun}, {adjective}, etc.
  const placeholderRegex = /\{(\w+)\}/g;
  let match;
  
  while ((match = placeholderRegex.exec(template)) !== null) {
    const category = match[1];
    if (fillWords[category] && fillWords[category].length > 0) {
      const randomWord = fillWords[category][Math.floor(Math.random() * fillWords[category].length)];
      prompt = prompt.replace(match[0], randomWord);
    }
  }
  
  return prompt;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Words to use for light theme-relevance checks (strips stopwords; splits "A and B" crossovers).
 * @param {string} theme
 * @returns {string[]}
 */
function themeRelevanceWords(theme) {
  const themeLower = theme.toLowerCase();
  const parts = themeLower.split(/\s+and\s+/);
  const words = [];
  for (const part of parts) {
    for (const w of part.split(/\s+/)) {
      if (w.length > 2 && !THEME_STOPWORDS.has(w)) words.push(w);
    }
  }
  return words;
}

/**
 * Check if a prompt is actually a valid prompt or if it's an AI refusal/explanation
 * @param {string} prompt - The prompt to validate
 * @param {string|null} theme - Optional theme to check relevance against
 * @returns {boolean} True if it's a valid prompt, false if it's a refusal/explanation
 */
function isValidPrompt(prompt, theme = null) {
  if (!prompt || prompt.length < 10) return false;
  
  // Check for common refusal/explanation patterns
  const refusalPatterns = [
    /I (appreciate|need|must|cannot|can't|should)/i,
    /I (respectfully|politely) (decline|refuse)/i,
    /doesn't have (characters|storylines|episodes|universe)/i,
    /isn't (a|an) (media|franchise|show|movie|book)/i,
    /rather than (a|an)/i,
    /To create (genuine|authentic)/i,
    /I would need/i,
    /I'm (not|unable)/i,
    /I (cannot|can't) (generate|create)/i,
    /the theme.*doesn't have/i,
    /biological term/i,
    /entertainment property/i,
    /established (lore|fan culture)/i,
    /following your (excellent )?guidelines/i,
    /would need an actual/i,
    /- Established/i,  // Bullet points in explanations
    /- Specific/i,
    /- Reference/i
  ];
  
  // If it matches refusal patterns, it's not a valid prompt
  for (const pattern of refusalPatterns) {
    if (pattern.test(prompt)) {
      return false;
    }
  }
  
  // Valid prompts should be questions or statements that can be completed
  // They shouldn't be too long (explanations are usually long)
  if (prompt.length > 200) return false;
  
  // Should look like a fill-in-the-blank prompt
  // Check if it's a question or statement that makes sense as a prompt
  const validPromptPatterns = [
    /^(What|Why|How|When|Where|Who|The|A|An|Your|My|Their|His|Her|This|That|If|The worst|The best|The most|The least|Something|Nothing|Anything)/i,
    /'s (worst|best|most|least|first|last)/i,
    /would (say|do|think|write|name|call|tell|ask)/i,
    /should (say|do|think|write|name|call)/i,
    /could (say|do|think|write|name|call)/i
  ];
  
  // If it doesn't match any valid prompt patterns, it might be an explanation
  const hasValidPattern = validPromptPatterns.some(pattern => pattern.test(prompt));
  
  if (!hasValidPattern) return false;
  
  // If theme is provided, do a light relevance check
  // We're lenient here - the AI and sanitization handle appropriateness
  // This just catches completely unrelated prompts
  if (theme) {
    const promptLower = prompt.toLowerCase();
    const themeWords = themeRelevanceWords(theme);
    const hasThemeReference = themeWords.length > 0 && themeWords.some(word => {
      const wordRegex = new RegExp(`\\b${escapeRegex(word)}\\w*\\b`, 'i');
      return wordRegex.test(promptLower);
    });
    
    // For single-word themes, be lenient - only reject if it's clearly completely unrelated
    // Since we have sanitization, we trust the AI to generate appropriate content
    // Only reject if it's a very specific single word and the prompt has no connection
    if (themeWords.length === 1 && !hasThemeReference) {
      return true; // Allow through - trust the AI's judgment
    }
  }
  
  return true;
}

/**
 * Sanitize a theme by getting an appropriate alternative that maintains the original intent.
 * In Adult Mode, we skip sanitization completely (no filtering).
 * @param {string} originalTheme - The original theme that was deemed inappropriate
 * @param {boolean} isAdult - Whether adult mode is active (if true, no sanitization)
 * @returns {Promise<string|null>} An appropriate alternative theme, or null if sanitization fails/skipped
 */
async function sanitizeTheme(originalTheme, isAdult = false) {
  if (isAdult) {
    // No filtering in Adult Mode - allow any theme
    return null;
  }

  if (!getActiveClient()) {
    return null;
  }

  try {
    const sanitized = (await callAI({
      system: 'You are a helpful assistant that suggests appropriate alternative themes for party games while maintaining the original concept.',
      userContent: `The theme "${originalTheme}" is not appropriate for generating party game prompts. Suggest a more appropriate, family-friendly alternative theme that captures the same general concept or category. 

For example:
- "penis" → "anatomy" or "biology" or "health"
- "sex" → "dating" or "relationships"
- "drugs" → "medicine" or "pharmacy"

Return ONLY the alternative theme (1-3 words), nothing else.`,
      maxTokens: 128
    })).trim();
    // Clean up any extra text
    const lines = sanitized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result = lines[0] || sanitized;
    
    // Remove quotes if present
    const cleanResult = result.replace(/^["']|["']$/g, '').trim();
    
    if (cleanResult && cleanResult.length > 0 && cleanResult.length < 50) {
      return cleanResult;
    }
    
    return null;
  } catch (error) {
    console.error('Theme sanitization failed:', error.message);
    return null;
  }
}

/**
 * Generate prompts using Claude AI
 * @param {number} count - Number of prompts to generate
 * @param {Set} usedPrompts - Set of already used prompt strings to avoid
 * @param {string|null} theme - Optional theme for themed prompt generation
 * @param {string|null} originalTheme - The original theme if this is a sanitized attempt
 * @param {boolean} isAdult - Whether adult mode is active (skips all theme sanitization)
 * @returns {Promise<Array>} Array of AI-generated prompt strings
 */
async function generatePromptsWithAI(count, usedPrompts = new Set(), theme = null, originalTheme = null, isAdult = false) {
  if (!getActiveClient()) {
    throw new Error('AI client not initialized - check your API key for the selected provider');
  }

  const usedList = Array.from(usedPrompts).slice(-20);
  const usedContext = usedList.length > 0 
    ? `\n\nAvoid these already-used prompts:\n${usedList.map(p => `- "${p}"`).join('\n')}`
    : '';
  
  const themeContext = theme 
    ? `\n\nIMPORTANT: Create prompts inspired by "${theme}" that are simple and immediately understandable. Root them in the everyday situations, humor, and experiences that naturally surround "${theme}" — do not rely on named characters, franchises, or celebrity references. Always generate actual prompts, never explanations or refusals.`
    : '';

  const responseText = await callAI({
    system: getAISystemPrompt(theme, isAdult),
    userContent: `Generate exactly ${count} unique, creative QuipLash-style prompts. Return ONLY the prompts, one per line, no numbering or extra formatting.${usedContext}${themeContext}`,
    maxTokens: 1024
  });
  const allLines = responseText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/)); // Remove empty lines and numbering
  
  // Filter out AI refusals/explanations and keep only valid prompts
  const validPrompts = allLines.filter(line => isValidPrompt(line, theme));
  
  // For adult mode with xAI, be more lenient with validation since prompts are intentionally edgy
  if (isAdult && validPrompts.length === 0) {
    return allLines.slice(0, count); // Accept more aggressive content
  }
  
  // If we got valid prompts, return them (up to count)
  if (validPrompts.length > 0) {
    return validPrompts.slice(0, count);
  }
  
  // If all prompts were invalid (AI refused), try sanitizing the theme
  // Skip sanitization entirely in Adult Mode (no filter at all)
  if (validPrompts.length === 0 && theme && !originalTheme && !isAdult) {
    console.warn(`AI returned no valid prompts for theme "${theme}". Attempting to sanitize theme...`);
    const sanitizedTheme = await sanitizeTheme(theme, isAdult);
    
    if (sanitizedTheme && sanitizedTheme !== theme) {
      // Retry with sanitized theme, marking originalTheme to prevent infinite loops.
      // Pass isAdult through so adult behavior is preserved.
      return generatePromptsWithAI(count, usedPrompts, sanitizedTheme, theme, isAdult);
    }
  }
  
  // If still no valid prompts (or sanitization failed), return empty array
  // This will trigger fallback to local templates
  if (validPrompts.length === 0) {
    // Show the theme we actually tried (sanitized if applicable)
    let displayTheme = theme;
    if (originalTheme) {
      displayTheme = `${originalTheme} (sanitized to "${theme}")`;
    } else if (isAdult) {
      displayTheme = `${theme} (Adult Mode - no sanitization)`;
    }
    console.warn(`AI returned no valid prompts for theme "${displayTheme}". Falling back to local templates.`);
  }
  
  return validPrompts;
}

/**
 * Generate unique adult prompts using adult templates
 * Separate from standard prompts to maintain distinction
 */
function generateUniqueAdultPrompts(count, usedPrompts = new Set()) {
  const prompts = [];
  const maxAttempts = count * 10;
  let attempts = 0;
  
  const adultTemplates = adultPromptData.templates.length > 0 
    ? adultPromptData.templates 
    : promptData.templates; // fallback
  
  const adultFillWords = adultPromptData.fillWords || promptData.fillWords;
  
  while (prompts.length < count && attempts < maxAttempts) {
    attempts++;
    
    const template = adultTemplates[Math.floor(Math.random() * adultTemplates.length)];
    const prompt = generatePrompt(template, adultFillWords);
    
    if (!usedPrompts.has(prompt) && !prompts.includes(prompt)) {
      prompts.push(prompt);
      usedPrompts.add(prompt);
    }
  }
  
  // Fill remaining if needed
  while (prompts.length < count) {
    const template = adultTemplates[Math.floor(Math.random() * adultTemplates.length)];
    const prompt = generatePrompt(template, adultFillWords);
    prompts.push(prompt);
  }
  
  return prompts;
}

/**
 * Generate unique prompts for a game session
 * @param {number} count - Number of prompts to generate
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @returns {Array} Array of unique prompt strings
 */
function generateUniquePrompts(count, usedPrompts = new Set()) {
  const prompts = [];
  const maxAttempts = count * 10; // Prevent infinite loop
  let attempts = 0;
  
  while (prompts.length < count && attempts < maxAttempts) {
    attempts++;
    
    // Pick a random template
    const template = promptData.templates[Math.floor(Math.random() * promptData.templates.length)];
    const prompt = generatePrompt(template, promptData.fillWords);
    
    // Check if unique
    if (!usedPrompts.has(prompt) && !prompts.includes(prompt)) {
      prompts.push(prompt);
      usedPrompts.add(prompt);
    }
  }
  
  // If we couldn't generate enough unique prompts, fill with whatever we can
  while (prompts.length < count) {
    const template = promptData.templates[Math.floor(Math.random() * promptData.templates.length)];
    const prompt = generatePrompt(template, promptData.fillWords);
    prompts.push(prompt);
  }
  
  return prompts;
}

/**
 * Generate unique prompts for a game session (async with AI-first approach)
 * Uses AI for generation, falls back to local templates if AI is unavailable
 * @param {number} count - Number of prompts to generate
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @param {boolean} useAI - Whether to use AI for generation (default: true)
 * @param {string|string[]|null} themeOrThemes - Optional theme(s); array enables multi-theme mixing
 * @returns {Promise<Array>} Array of unique prompt strings
 */
async function generateUniquePromptsAsync(count, usedPrompts = new Set(), useAI = true, themeOrThemes = null, isAdult = false) {
  const themes = normalizeThemesArg(themeOrThemes);
  const multi = themes && themes.length >= 2;

  // Try AI generation first (with or without theme)
  if (useAI && getActiveClient()) {
    try {
      if (multi) {
        const buckets = buildThemeLabelBuckets(count, themes);
        const uniquePrompts = [];
        for (const bucket of buckets) {
          if (bucket.count <= 0) continue;
          const batch = await generatePromptsWithAI(bucket.count, usedPrompts, bucket.label, null, isAdult);
          for (const prompt of batch) {
            if (!usedPrompts.has(prompt) && !uniquePrompts.includes(prompt)) {
              uniquePrompts.push(prompt);
              usedPrompts.add(prompt);
            }
          }
        }
        shuffleArray(uniquePrompts);
        if (uniquePrompts.length >= count) {
          return uniquePrompts.slice(0, count);
        }
        const needed = count - uniquePrompts.length;
        if (needed > 0) {
          const pick = themes[Math.floor(Math.random() * themes.length)];
          const more = await generatePromptsWithAI(needed, usedPrompts, pick, null, isAdult);
          for (const prompt of more) {
            if (!usedPrompts.has(prompt) && !uniquePrompts.includes(prompt)) {
              uniquePrompts.push(prompt);
              usedPrompts.add(prompt);
            }
          }
        }
        shuffleArray(uniquePrompts);
        if (uniquePrompts.length >= count) {
          return uniquePrompts.slice(0, count);
        }
        const still = count - uniquePrompts.length;
        const localPrompts = isAdult
          ? generateUniqueAdultPrompts(still, usedPrompts)
          : generateUniquePrompts(still, usedPrompts);
        return [...uniquePrompts, ...localPrompts].slice(0, count);
      }

      const theme = themes && themes.length === 1 ? themes[0] : null;

      const aiPrompts = await generatePromptsWithAI(count, usedPrompts, theme, null, isAdult);

      // Filter to unique prompts and add to used set
      const uniquePrompts = [];
      for (const prompt of aiPrompts) {
        if (!usedPrompts.has(prompt) && !uniquePrompts.includes(prompt)) {
          uniquePrompts.push(prompt);
          usedPrompts.add(prompt);
        }
      }

      // If we got enough, return them
      if (uniquePrompts.length >= count) {
        return uniquePrompts.slice(0, count);
      }

      // If we need more, try again with remaining count
      if (uniquePrompts.length > 0 && uniquePrompts.length < count) {
        const morePrompts = await generatePromptsWithAI(count - uniquePrompts.length, usedPrompts, theme, null, isAdult);
        for (const prompt of morePrompts) {
          if (!usedPrompts.has(prompt) && !uniquePrompts.includes(prompt)) {
            uniquePrompts.push(prompt);
            usedPrompts.add(prompt);
            if (uniquePrompts.length >= count) break;
          }
        }
      }

      // If AI gave us enough, return them
      if (uniquePrompts.length >= count) {
        return uniquePrompts.slice(0, count);
      }

      // AI didn't give us enough - fill remaining with local templates
      // Use adult templates if in adult mode
      const needed = count - uniquePrompts.length;
      const localPrompts = isAdult
        ? generateUniqueAdultPrompts(needed, usedPrompts)
        : generateUniquePrompts(needed, usedPrompts);
      return [...uniquePrompts, ...localPrompts].slice(0, count);

    } catch (error) {
      console.error('AI prompt generation failed:', error.message);
      // Fall through to local generation
    }
  }

  // AI unavailable or disabled - use local template generation
  // Use adult templates if in adult mode
  return isAdult
    ? generateUniqueAdultPrompts(count, usedPrompts)
    : generateUniquePrompts(count, usedPrompts);
}

/**
 * Generate a single prompt for Last Wit round
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @returns {string} A unique prompt string
 */
function generateLastLashPrompt(usedPrompts = new Set()) {
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    const template = promptData.templates[Math.floor(Math.random() * promptData.templates.length)];
    const prompt = generatePrompt(template, promptData.fillWords);
    
    if (!usedPrompts.has(prompt)) {
      usedPrompts.add(prompt);
      return prompt;
    }
  }
  
  // Fallback - just generate one
  const template = promptData.templates[Math.floor(Math.random() * promptData.templates.length)];
  return generatePrompt(template, promptData.fillWords);
}

/**
 * Generate a single adult Last Wit prompt
 */
function generateLastLashAdultPrompt(usedPrompts = new Set()) {
  const adultTemplates = adultPromptData.templates.length > 0 
    ? adultPromptData.templates 
    : promptData.templates;
  const adultFillWords = adultPromptData.fillWords || promptData.fillWords;
  
  const maxAttempts = 50;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    const template = adultTemplates[Math.floor(Math.random() * adultTemplates.length)];
    const prompt = generatePrompt(template, adultFillWords);
    
    if (!usedPrompts.has(prompt)) {
      usedPrompts.add(prompt);
      return prompt;
    }
  }
  
  const template = adultTemplates[Math.floor(Math.random() * adultTemplates.length)];
  return generatePrompt(template, adultFillWords);
}

/**
 * Generate a single prompt for Last Wit round (async with AI-first approach)
 * Uses AI for generation, falls back to local templates if AI is unavailable
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @param {boolean} useAI - Whether to use AI for generation (default: true)
 * @param {string|null} theme - Optional theme for themed prompt
 * @returns {Promise<string>} A unique prompt string
 */
async function generateLastLashPromptAsync(usedPrompts = new Set(), useAI = true, theme = null, isAdult = false) {
  // Try AI generation first (with or without theme)
  if (useAI && getActiveClient()) {
    try {
      const aiPrompts = await generatePromptsWithAI(1, usedPrompts, theme, null, isAdult);
      if (aiPrompts.length > 0 && !usedPrompts.has(aiPrompts[0])) {
        usedPrompts.add(aiPrompts[0]);
        return aiPrompts[0];
      }
    } catch (error) {
      console.error('AI Last Wit generation failed:', error.message);
      // Fall through to local generation
    }
  }
  
  // AI unavailable or failed - use local template generation
  // Use adult templates if in adult mode
  return isAdult 
    ? generateLastLashAdultPrompt(usedPrompts) 
    : generateLastLashPrompt(usedPrompts);
}

/**
 * Get the number of prompts needed for a round
 * Each player gets PROMPTS_PER_PLAYER prompts
 * Each prompt is answered by 2 players
 * Total prompts = (players * prompts_per_player) / 2
 */
function getPromptsNeededForRound(playerCount, promptsPerPlayer = 2) {
  return Math.ceil((playerCount * promptsPerPlayer) / 2);
}

/**
 * Check if AI prompt generation is available for the active provider
 * @returns {boolean} True if the active provider's API key is configured
 */
function isAIAvailable() {
  return config.hasActiveApiKey();
}

/**
 * Randomly select a Last Wit mode
 * @returns {string} One of LAST_WIT_MODES values
 */
function selectRandomLastWitMode() {
  const modes = Object.values(LAST_WIT_MODES);
  return modes[Math.floor(Math.random() * modes.length)];
}

/**
 * Generate a Flashback Lash prompt (story completion)
 * A short story setup with a missing final line
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @param {string|null} theme - Optional theme for themed generation
 * @returns {object} { prompt: string, mode: 'FLASHBACK' }
 */
function generateFlashbackPrompt(usedPrompts = new Set(), theme = null) {
  const setups = promptData.flashbackSetups || [];
  
  // Filter out already used setups
  const available = setups.filter(s => !usedPrompts.has(s));
  const pool = available.length > 0 ? available : setups;
  
  // Select random setup
  const setup = pool[Math.floor(Math.random() * pool.length)];
  usedPrompts.add(setup);
  
  return {
    prompt: setup,
    mode: LAST_WIT_MODES.FLASHBACK,
    instructions: 'Complete the story'
  };
}

/**
 * Generate a Flashback Lash prompt with AI (story completion)
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @param {string|null} theme - Optional theme for themed generation
 * @returns {Promise<object>} { prompt: string, mode: 'FLASHBACK' }
 */
async function generateFlashbackPromptAsync(usedPrompts = new Set(), theme = null) {
  if (getActiveClient() && theme) {
    try {
      const prompt = (await callAI({
        system: 'You are a comedy writer creating Flashback Lash prompts for a party game. Create engaging story setups that end on a cliffhanger with "Then..." for players to complete. Be creative and tie into the given theme authentically.',
        userContent: `Generate ONE Flashback Lash prompt for the theme "${theme}". 
This is a short story setup where players complete the final line.
The story should end with "Then..." so players write what happens next.
Make it specific to the "${theme}" universe - use characters, locations, or situations from it.
Keep it under 200 characters. Return ONLY the story setup, nothing else.

Example format: "The [character] was [doing something] when [something unexpected happened]. Then..."`,
        maxTokens: 512
      })).trim();
      if (prompt && !usedPrompts.has(prompt)) {
        usedPrompts.add(prompt);
        return {
          prompt,
          mode: LAST_WIT_MODES.FLASHBACK,
          instructions: 'Complete the story'
        };
      }
    } catch (error) {
      console.error('AI Flashback generation failed:', error.message);
    }
  }
  
  // Fallback to local templates
  return generateFlashbackPrompt(usedPrompts, theme);
}

/**
 * Generate a Word Lash prompt (starting letters)
 * Players create a phrase using given starting letters (e.g., T. F. N.)
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {string|null} theme - Optional theme
 * @returns {object} { prompt: string, letters: string, mode: 'WORD_LASH' }
 */
function generateWordLashPrompt(usedPrompts = new Set(), theme = null) {
  const letterPool = promptData.acroLashLetters || 'ABCDEFGHIJKLMNOPRSTUVW';
  
  // Generate 3 random letters
  const letters = [];
  const usedLetters = new Set();
  
  while (letters.length < 3) {
    const letter = letterPool[Math.floor(Math.random() * letterPool.length)];
    // Allow some repeats but not consecutive
    if (letters.length === 0 || letters[letters.length - 1] !== letter) {
      letters.push(letter);
    }
  }
  
  const letterString = letters.join('. ') + '.';
  const promptKey = `WORD_LASH:${letterString}`;
  
  // Try to avoid reused letter combinations
  if (usedPrompts.has(promptKey)) {
    // Just regenerate once - duplicates are acceptable
    return generateWordLashPrompt(usedPrompts, theme);
  }
  
  usedPrompts.add(promptKey);
  
  return {
    prompt: letterString,
    letters: letters,
    mode: LAST_WIT_MODES.WORD_LASH,
    instructions: 'Create a phrase where each word starts with these letters'
  };
}

/**
 * Pool for Roast Lash: adult list when isAdult and non-empty, else regular; fallback chain.
 */
function getRoastPromptPool(isAdult) {
  const regular = promptData.roastPrompts;
  const adult = adultPromptData.roastPrompts;
  if (isAdult && Array.isArray(adult) && adult.length > 0) return adult;
  if (Array.isArray(regular) && regular.length > 0) return regular;
  if (Array.isArray(adult) && adult.length > 0) return adult;
  return ['The meanest roast you can write:'];
}

/**
 * Generate a Roast Lash prompt (shared roast / burn premise)
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {string|null} theme - Unused for local pool (async AI uses theme)
 * @param {boolean} isAdult - Use adult roast bank when true
 * @returns {object} { prompt, mode: 'ROAST_LASH', instructions }
 */
function generateRoastPrompt(usedPrompts = new Set(), theme = null, isAdult = false) {
  const pool = getRoastPromptPool(isAdult);
  const available = pool.filter(s => !usedPrompts.has(s));
  const pickPool = available.length > 0 ? available : pool;
  const line = pickPool[Math.floor(Math.random() * pickPool.length)];
  usedPrompts.add(line);
  return {
    prompt: line,
    mode: LAST_WIT_MODES.ROAST_LASH,
    instructions: 'Write your funniest roast or one-liner'
  };
}

/**
 * Themed Roast Lash via AI; falls back to local roast bank
 */
async function generateRoastPromptAsync(usedPrompts = new Set(), theme = null, isAdult = false) {
  if (getActiveClient() && theme) {
    try {
      const systemRegular = 'You are a comedy writer for Roast Lash in a party game. Generate ONE prompt line that asks all players for a single funny roast, burn, or brutal one-liner (not a story). PG-13: edgy humor is OK; no slurs; do not instruct players to attack each other by name. Abstract or situational targets only.';
      const systemAdult = 'You write Roast Lash prompts for an uncensored adult party game. Generate ONE prompt line asking for a raunchy, edgy roast or burn tied to the theme—like Cards Against Humanity or Quiplash adult mode. Do not instruct targeting other players by name or seat. Return only the prompt line.';
      const prompt = (await callAI({
        system: isAdult ? systemAdult : systemRegular,
        userContent: `Generate ONE Roast Lash prompt for the theme "${theme}".
The prompt must ask players for a single funny roast or brutal one-liner (not a story).
Make it specific to the "${theme}" universe.
Keep it under 200 characters. Return ONLY the prompt line, nothing else.`,
        maxTokens: 256
      })).trim();
      if (prompt && !usedPrompts.has(prompt)) {
        usedPrompts.add(prompt);
        return {
          prompt,
          mode: LAST_WIT_MODES.ROAST_LASH,
          instructions: 'Write your funniest roast or one-liner'
        };
      }
    } catch (error) {
      console.error('AI Roast Lash generation failed:', error.message);
    }
  }
  return generateRoastPrompt(usedPrompts, theme, isAdult);
}

/**
 * Generate Last Wit prompt based on randomly selected mode
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {string|null} theme - Optional theme
 * @param {boolean} isAdult - Roast Lash bank selection
 * @returns {object} Mode-specific prompt object
 */
function generateLastWitPrompt(usedPrompts = new Set(), theme = null, isAdult = false) {
  const mode = selectRandomLastWitMode();
  
  switch (mode) {
    case LAST_WIT_MODES.FLASHBACK:
      return generateFlashbackPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.WORD_LASH:
      return generateWordLashPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.ROAST_LASH:
      return generateRoastPrompt(usedPrompts, theme, isAdult);
    default:
      return generateFlashbackPrompt(usedPrompts, theme);
  }
}

/**
 * Generate Last Wit prompt based on randomly selected mode (async with AI support)
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {boolean} useAI - Whether to use AI generation
 * @param {string|null} theme - Optional theme
 * @returns {Promise<object>} Mode-specific prompt object
 */
async function generateLastWitPromptAsync(usedPrompts = new Set(), useAI = true, theme = null, isAdult = false) {
  const mode = selectRandomLastWitMode();
  
  switch (mode) {
    case LAST_WIT_MODES.FLASHBACK:
      if (useAI && getActiveClient()) {
        return generateFlashbackPromptAsync(usedPrompts, theme);
      }
      return generateFlashbackPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.WORD_LASH:
      return generateWordLashPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.ROAST_LASH:
      if (useAI && getActiveClient()) {
        return generateRoastPromptAsync(usedPrompts, theme, isAdult);
      }
      return generateRoastPrompt(usedPrompts, theme, isAdult);
    default:
      return generateFlashbackPrompt(usedPrompts, theme);
  }
}

/**
 * Validate a Word Lash answer (soft validation, case-insensitive)
 * @param {string} answer - The player's answer
 * @param {string[]} letters - The required starting letters
 * @returns {object} { valid: boolean, message: string|null }
 */
function validateWordLashAnswer(answer, letters) {
  if (!answer || !letters || letters.length === 0) {
    return { valid: true, message: null };
  }
  
  const words = answer.trim().split(/\s+/);
  
  if (words.length < letters.length) {
    return { 
      valid: false, 
      message: `Need at least ${letters.length} words starting with ${letters.join(', ')}`
    };
  }
  
  // Check first N words match the letters (case-insensitive)
  for (let i = 0; i < letters.length; i++) {
    const word = words[i] || '';
    const expectedLetter = letters[i].toLowerCase();
    const actualLetter = word.charAt(0).toLowerCase();
    
    if (actualLetter !== expectedLetter) {
      return {
        valid: false,
        message: `Word ${i + 1} should start with "${letters[i]}"`
      };
    }
  }
  
  return { valid: true, message: null };
}

module.exports = {
  generatePrompt,
  generateUniquePrompts,
  generateUniquePromptsAsync,
  generateLastLashPrompt,
  generateLastLashPromptAsync,
  getPromptsNeededForRound,
  isAIAvailable,
  reinitializeClient,
  promptData,
  parseThemes,
  buildThemeLabelBuckets,
  pickRandomThemeLabel,
  // Last Wit mode functions
  selectRandomLastWitMode,
  generateFlashbackPrompt,
  generateFlashbackPromptAsync,
  generateWordLashPrompt,
  generateRoastPrompt,
  generateRoastPromptAsync,
  generateLastWitPrompt,
  generateLastWitPromptAsync,
  validateWordLashAnswer,
  generateUniqueAdultPrompts
};
