const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Anthropic SDK for AI-powered prompt generation
const Anthropic = require('@anthropic-ai/sdk').default;

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

const promptData = loadTemplates();

// Initialize Anthropic client (lazy initialization to handle missing API key gracefully)
let anthropicClient = null;

function getAnthropicClient() {
  const apiKey = config.getAnthropicApiKey() || process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    anthropicClient = null;
    return null;
  }
  
  // Reinitialize if no client or if the key might have changed
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: apiKey,
    });
  }
  
  return anthropicClient;
}

/**
 * Reinitialize the Anthropic client (call after API key changes)
 */
function reinitializeClient() {
  anthropicClient = null;
  // Force recreation on next use
  return getAnthropicClient();
}

// Base system prompt for AI-generated prompts (no theme)
const AI_SYSTEM_PROMPT_BASE = `You are a hilarious comedy writer for an adult QuipLash-style party game. Your job is to generate funny, edgy, and entertaining fill-in-the-blank style prompts for a group of adult friends.

Guidelines:
- Prompts should be open-ended enough for creative, hilarious answers
- This is for ADULTS at a game night - be funny, edgy, and a bit raunchy
- Topics can include: dating, relationships, embarrassing moments, drinking, work complaints, awkward situations, adult humor, innuendos
- Make them absurd, surprising, provocative, or set up hilariously uncomfortable situations
- Sexual innuendos and suggestive content are encouraged (but avoid explicit/graphic content)
- Format: A statement or question that players complete with their answer
- Keep prompts concise (under 100 characters ideally)

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

Generate creative, original, adult-oriented prompts in a similar style.`;

/**
 * Get AI system prompt, building a theme-focused prompt when a theme is provided
 * When themed, the entire prompt is rewritten to prioritize the theme's universe,
 * characters, and humor style over generic adult party game content.
 * @param {string|null} theme - Optional theme to incorporate into prompts
 * @returns {string} The system prompt for AI generation
 */
function getAISystemPrompt(theme = null) {
  if (!theme) {
    return AI_SYSTEM_PROMPT_BASE;
  }
  
  // When a theme is provided, build a completely theme-focused prompt
  return `You are a hilarious comedy writer for a QuipLash-style party game. Your job is to generate funny, creative fill-in-the-blank style prompts that are DEEPLY ROOTED in the theme: "${theme}"

THEME-FIRST APPROACH:
- Every prompt MUST authentically reference the theme's universe, characters, storylines, catchphrases, running jokes, or iconic moments
- Think like a superfan of "${theme}" - use specific references that fans would recognize and appreciate
- The humor should come FROM the theme itself, not generic situations with theme names inserted
- Reference specific characters, locations, episodes, quotes, relationships, and inside jokes from "${theme}"
- Capture the tone and humor style that "${theme}" is known for

Guidelines:
- Prompts should be open-ended enough for creative, hilarious answers
- Format: A statement or question that players complete with their answer
- Keep prompts concise (under 100 characters ideally)
- Make them funny, surprising, and authentically connected to "${theme}"

Examples of GOOD themed prompts (theme-authentic):
- For "The Office": "What Michael Scott wrote in his diary after the Dundies"
- For "Star Wars": "Yoda's rejected wisdom that didn't make the Jedi training manual"
- For "Family Guy": "The cutaway gag Peter Griffin had right before getting fired"
- For "Harry Potter": "The spell Dumbledore banned after one too many accidents"
- For "Marvel": "What Thor actually calls his hammer when no one's listening"

Examples of BAD themed prompts (generic with names inserted):
- "What [character] does on a first date" (too generic)
- "[Character]'s embarrassing work moment" (doesn't use theme's actual context)
- "A pickup line [character] would use" (not theme-specific humor)

Generate prompts that would make fans of "${theme}" laugh because they GET the reference. Be specific, be authentic, be hilarious.`;
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

/**
 * Generate prompts using Claude AI
 * @param {number} count - Number of prompts to generate
 * @param {Set} usedPrompts - Set of already used prompt strings to avoid
 * @param {string|null} theme - Optional theme for themed prompt generation
 * @returns {Promise<Array>} Array of AI-generated prompt strings
 */
async function generatePromptsWithAI(count, usedPrompts = new Set(), theme = null) {
  const client = getAnthropicClient();
  if (!client) {
    throw new Error('Anthropic client not initialized - check ANTHROPIC_API_KEY');
  }

  const usedList = Array.from(usedPrompts).slice(-20); // Include recent prompts for context
  const usedContext = usedList.length > 0 
    ? `\n\nAvoid these already-used prompts:\n${usedList.map(p => `- "${p}"`).join('\n')}`
    : '';
  
  const themeContext = theme 
    ? `\n\nCRITICAL: Focus on authentic "${theme}" content - specific characters, storylines, quotes, and references that fans would recognize. Do NOT create generic prompts with theme names inserted. Every prompt should feel like it belongs in the "${theme}" universe.`
    : '';

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Generate exactly ${count} unique, creative QuipLash-style prompts. Return ONLY the prompts, one per line, no numbering or extra formatting.${usedContext}${themeContext}`
      }
    ],
    system: getAISystemPrompt(theme),
  });

  // Parse response - each line is a prompt
  const responseText = message.content[0].text;
  const prompts = responseText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/)) // Remove empty lines and numbering
    .slice(0, count); // Ensure we don't return more than requested

  return prompts;
}

/**
 * Validate a prompt using Claude AI to check for typos and coherence
 * @param {string} prompt - The prompt to validate
 * @returns {Promise<{valid: boolean, corrected: string|null, reason: string|null}>}
 */
async function validatePrompt(prompt) {
  const client = getAnthropicClient();
  if (!client) {
    // If no AI available, assume valid
    return { valid: true, corrected: null, reason: null };
  }

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Check this QuipWits game prompt for typos, grammar issues, or if it doesn't make sense:
"${prompt}"

Respond in JSON format:
{"valid": true/false, "corrected": "corrected version if invalid, null if valid", "reason": "brief explanation if invalid, null if valid"}`
        }
      ],
    });

    const responseText = message.content[0].text;
    // Try to parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { valid: true, corrected: null, reason: null };
  } catch (error) {
    // On error, assume valid to not block game
    console.error('Prompt validation error:', error.message);
    return { valid: true, corrected: null, reason: null };
  }
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
 * @param {string|null} theme - Optional theme for themed prompts
 * @returns {Promise<Array>} Array of unique prompt strings
 */
async function generateUniquePromptsAsync(count, usedPrompts = new Set(), useAI = true, theme = null) {
  // Try AI generation first (with or without theme)
  if (useAI && getAnthropicClient()) {
    try {
      const logMessage = theme 
        ? `Generating ${count} themed prompts for theme: "${theme}"`
        : `Generating ${count} prompts with AI`;
      console.log(logMessage);
      
      const aiPrompts = await generatePromptsWithAI(count, usedPrompts, theme);
      
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
        const morePrompts = await generatePromptsWithAI(count - uniquePrompts.length, usedPrompts, theme);
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
      console.log(`AI generated ${uniquePrompts.length}/${count} prompts, filling rest with templates...`);
      const needed = count - uniquePrompts.length;
      const localPrompts = generateUniquePrompts(needed, usedPrompts);
      return [...uniquePrompts, ...localPrompts].slice(0, count);
      
    } catch (error) {
      console.error('AI prompt generation failed:', error.message);
      console.log('Falling back to local templates...');
      // Fall through to local generation
    }
  }
  
  // AI unavailable or disabled - use local template generation
  return generateUniquePrompts(count, usedPrompts);
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
 * Generate a single prompt for Last Wit round (async with AI-first approach)
 * Uses AI for generation, falls back to local templates if AI is unavailable
 * @param {Set} usedPrompts - Set of already used prompt strings
 * @param {boolean} useAI - Whether to use AI for generation (default: true)
 * @param {string|null} theme - Optional theme for themed prompt
 * @returns {Promise<string>} A unique prompt string
 */
async function generateLastLashPromptAsync(usedPrompts = new Set(), useAI = true, theme = null) {
  // Try AI generation first (with or without theme)
  if (useAI && getAnthropicClient()) {
    try {
      const logMessage = theme 
        ? `Generating themed Last Wit prompt for theme: "${theme}"`
        : 'Generating Last Wit prompt with AI';
      console.log(logMessage);
      
      const aiPrompts = await generatePromptsWithAI(1, usedPrompts, theme);
      if (aiPrompts.length > 0 && !usedPrompts.has(aiPrompts[0])) {
        usedPrompts.add(aiPrompts[0]);
        return aiPrompts[0];
      }
    } catch (error) {
      console.error('AI Last Wit generation failed:', error.message);
      console.log('Falling back to local templates...');
      // Fall through to local generation
    }
  }
  
  // AI unavailable or failed - use local template generation
  return generateLastLashPrompt(usedPrompts);
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
 * Check if AI prompt generation is available
 * @returns {boolean} True if Anthropic API key is configured
 */
function isAIAvailable() {
  return !!(config.getAnthropicApiKey() || process.env.ANTHROPIC_API_KEY);
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
  const client = getAnthropicClient();
  
  if (client && theme) {
    try {
      console.log(`Generating themed Flashback Lash prompt for theme: "${theme}"`);
      
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: `Generate ONE Flashback Lash prompt for the theme "${theme}". 
This is a short story setup where players complete the final line.
The story should end with "Then..." so players write what happens next.
Make it specific to the "${theme}" universe - use characters, locations, or situations from it.
Keep it under 200 characters. Return ONLY the story setup, nothing else.

Example format: "The [character] was [doing something] when [something unexpected happened]. Then..."`
          }
        ],
        system: 'You are a comedy writer creating Flashback Lash prompts for a party game. Create engaging story setups that end on a cliffhanger with "Then..." for players to complete. Be creative and tie into the given theme authentically.'
      });
      
      const prompt = message.content[0].text.trim();
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
 * Generate an Acro Lash prompt (acronym expansion)
 * Players expand a random acronym (3-5 letters)
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {string|null} theme - Optional theme
 * @returns {object} { prompt: string, letters: string[], letterCount: number, mode: 'ACRO_LASH' }
 */
function generateAcroLashPrompt(usedPrompts = new Set(), theme = null) {
  const letterPool = promptData.acroLashLetters || 'ABCDEFGHIJKLMNOPRSTUVW';
  
  // Random length between 3-5 letters
  const letterCount = Math.floor(Math.random() * 3) + 3; // 3, 4, or 5
  
  const letters = [];
  while (letters.length < letterCount) {
    const letter = letterPool[Math.floor(Math.random() * letterPool.length)];
    // Avoid consecutive same letters
    if (letters.length === 0 || letters[letters.length - 1] !== letter) {
      letters.push(letter);
    }
  }
  
  const letterString = letters.join('. ') + '.';
  const promptKey = `ACRO_LASH:${letterString}`;
  
  // Try to avoid reused combinations
  if (usedPrompts.has(promptKey)) {
    return generateAcroLashPrompt(usedPrompts, theme);
  }
  
  usedPrompts.add(promptKey);
  
  return {
    prompt: letterString,
    letters: letters,
    letterCount: letterCount,
    mode: LAST_WIT_MODES.ACRO_LASH,
    instructions: 'Create an acronym where each letter starts a word'
  };
}

/**
 * Generate Last Wit prompt based on randomly selected mode
 * @param {Set} usedPrompts - Set of already used prompts
 * @param {string|null} theme - Optional theme
 * @returns {object} Mode-specific prompt object
 */
function generateLastWitPrompt(usedPrompts = new Set(), theme = null) {
  const mode = selectRandomLastWitMode();
  
  switch (mode) {
    case LAST_WIT_MODES.FLASHBACK:
      return generateFlashbackPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.WORD_LASH:
      return generateWordLashPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.ACRO_LASH:
      return generateAcroLashPrompt(usedPrompts, theme);
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
async function generateLastWitPromptAsync(usedPrompts = new Set(), useAI = true, theme = null) {
  const mode = selectRandomLastWitMode();
  
  switch (mode) {
    case LAST_WIT_MODES.FLASHBACK:
      if (useAI && getAnthropicClient()) {
        return generateFlashbackPromptAsync(usedPrompts, theme);
      }
      return generateFlashbackPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.WORD_LASH:
      // Word Lash is just random letters, no AI needed
      return generateWordLashPrompt(usedPrompts, theme);
    case LAST_WIT_MODES.ACRO_LASH:
      // Acro Lash is just random letters, no AI needed
      return generateAcroLashPrompt(usedPrompts, theme);
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

/**
 * Validate an Acro Lash answer (soft validation, case-insensitive)
 * @param {string} answer - The player's answer
 * @param {string[]} letters - The required starting letters
 * @returns {object} { valid: boolean, message: string|null }
 */
function validateAcroLashAnswer(answer, letters) {
  if (!answer || !letters || letters.length === 0) {
    return { valid: true, message: null };
  }
  
  // letters is a string like "LOL", convert to array for processing
  const lettersArray = typeof letters === 'string' ? letters.split('') : letters;
  
  const words = answer.trim().split(/\s+/);
  
  // Acro Lash requires exact word count matching letters
  if (words.length !== lettersArray.length) {
    return {
      valid: false,
      message: `Need exactly ${lettersArray.length} words for ${lettersArray.join('.')}.`
    };
  }
  
  // Check each word starts with corresponding letter (case-insensitive)
  for (let i = 0; i < lettersArray.length; i++) {
    const word = words[i] || '';
    const expectedLetter = lettersArray[i].toLowerCase();
    const actualLetter = word.charAt(0).toLowerCase();
    
    if (actualLetter !== expectedLetter) {
      return {
        valid: false,
        message: `Word ${i + 1} should start with "${lettersArray[i]}"`
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
  generatePromptsWithAI,
  validatePrompt,
  getPromptsNeededForRound,
  isAIAvailable,
  reinitializeClient,
  promptData,
  // Last Wit mode functions
  selectRandomLastWitMode,
  generateFlashbackPrompt,
  generateFlashbackPromptAsync,
  generateWordLashPrompt,
  generateAcroLashPrompt,
  generateLastWitPrompt,
  generateLastWitPromptAsync,
  validateWordLashAnswer,
  validateAcroLashAnswer
};
