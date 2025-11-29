/**
 * Unit Tests for Prompt Generator (server/promptGenerator.js)
 * Tests: Template processing, unique generation, fill words, Last Wit modes
 */

const promptGenerator = require('../../server/promptGenerator');
const { LAST_WIT_MODES } = require('../../shared/constants');

describe('Prompt Generator', () => {
  describe('Template Loading', () => {
    test('PG-001: loads templates from JSON', () => {
      expect(promptGenerator.promptData.templates).toBeDefined();
      expect(Array.isArray(promptGenerator.promptData.templates)).toBe(true);
      expect(promptGenerator.promptData.templates.length).toBeGreaterThan(0);
    });

    test('PG-002: loads all fill word categories', () => {
      const fillWords = promptGenerator.promptData.fillWords;
      
      expect(fillWords.noun).toBeDefined();
      expect(fillWords.adjective).toBeDefined();
      expect(fillWords.place).toBeDefined();
      expect(fillWords.event).toBeDefined();
      expect(fillWords.activity).toBeDefined();
      expect(fillWords.adverb).toBeDefined();
      expect(fillWords.person).toBeDefined();

      // Each category should have words
      Object.values(fillWords).forEach(category => {
        expect(Array.isArray(category)).toBe(true);
        expect(category.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prompt Generation', () => {
    test('PG-003: generates prompt from template', () => {
      const template = 'A terrible name for a {noun}-themed restaurant';
      const fillWords = { noun: ['pizza'] };
      
      const prompt = promptGenerator.generatePrompt(template, fillWords);
      
      expect(prompt).toBe('A terrible name for a pizza-themed restaurant');
    });

    test('PG-004: handles multiple placeholders', () => {
      const template = 'A {adjective} {noun} walking through a {place}';
      const fillWords = {
        adjective: ['angry'],
        noun: ['llama'],
        place: ['library']
      };
      
      const prompt = promptGenerator.generatePrompt(template, fillWords);
      
      expect(prompt).toBe('A angry llama walking through a library');
    });

    test('handles template with no placeholders', () => {
      const template = 'A static prompt with no variables';
      const prompt = promptGenerator.generatePrompt(template, {});
      
      expect(prompt).toBe(template);
    });

    test('handles missing fill word category', () => {
      const template = 'A {nonexistent} category';
      const prompt = promptGenerator.generatePrompt(template, {});
      
      // Should leave placeholder unchanged if category missing
      expect(prompt).toContain('{nonexistent}');
    });

    test('uses random fill words', () => {
      const template = 'A {noun} walks into a bar';
      const fillWords = { noun: ['cat', 'dog', 'bird', 'fish'] };
      
      // Generate multiple prompts and check for variation
      const results = new Set();
      for (let i = 0; i < 50; i++) {
        results.add(promptGenerator.generatePrompt(template, fillWords));
      }
      
      // Should have some variation (unless very unlucky)
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('Unique Prompt Generation', () => {
    test('UG-001: generates unique prompts with no duplicates', () => {
      const prompts = promptGenerator.generateUniquePrompts(10);
      
      expect(prompts.length).toBe(10);
      const uniquePrompts = new Set(prompts);
      expect(uniquePrompts.size).toBe(10);
    });

    test('UG-002: tracks used prompts', () => {
      const usedPrompts = new Set();
      
      const firstBatch = promptGenerator.generateUniquePrompts(5, usedPrompts);
      expect(usedPrompts.size).toBe(5);
      
      const secondBatch = promptGenerator.generateUniquePrompts(5, usedPrompts);
      expect(usedPrompts.size).toBe(10);
      
      // No overlap between batches
      firstBatch.forEach(p => {
        expect(secondBatch).not.toContain(p);
      });
    });

    test('UG-003: generates Last Wit prompt', () => {
      const usedPrompts = new Set();
      const prompt = promptGenerator.generateLastLashPrompt(usedPrompts);
      
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(usedPrompts.has(prompt)).toBe(true);
    });

    test('UG-003b: Last Wit prompt is unique from used', () => {
      const usedPrompts = new Set(['Some used prompt']);
      const prompt = promptGenerator.generateLastLashPrompt(usedPrompts);
      
      expect(prompt).not.toBe('Some used prompt');
    });

    test('UG-004: calculates prompts needed correctly', () => {
      // (players * prompts_per_player) / 2
      expect(promptGenerator.getPromptsNeededForRound(4, 2)).toBe(4);
      expect(promptGenerator.getPromptsNeededForRound(6, 2)).toBe(6);
      expect(promptGenerator.getPromptsNeededForRound(3, 2)).toBe(3);
      expect(promptGenerator.getPromptsNeededForRound(8, 2)).toBe(8);
    });

    test('UG-004b: handles odd numbers with ceiling', () => {
      // (5 * 2) / 2 = 5
      expect(promptGenerator.getPromptsNeededForRound(5, 2)).toBe(5);
      // (7 * 2) / 2 = 7
      expect(promptGenerator.getPromptsNeededForRound(7, 2)).toBe(7);
    });

    test('UG-005: falls back when many prompts requested', () => {
      // Request more prompts than likely unique combinations
      const prompts = promptGenerator.generateUniquePrompts(100);
      
      // Should still return requested count
      expect(prompts.length).toBe(100);
    });

    test('handles empty usedPrompts set', () => {
      const prompts = promptGenerator.generateUniquePrompts(5, new Set());
      expect(prompts.length).toBe(5);
    });

    test('handles undefined usedPrompts', () => {
      const prompts = promptGenerator.generateUniquePrompts(5);
      expect(prompts.length).toBe(5);
    });
  });

  describe('Template Variety', () => {
    test('templates use various placeholder types', () => {
      const templates = promptGenerator.promptData.templates;
      const placeholderTypes = new Set();
      
      templates.forEach(template => {
        const matches = template.match(/\{(\w+)\}/g);
        if (matches) {
          matches.forEach(match => {
            const type = match.replace(/[{}]/g, '');
            placeholderTypes.add(type);
          });
        }
      });
      
      // Should use multiple placeholder types
      expect(placeholderTypes.size).toBeGreaterThan(3);
    });

    test('all template placeholders have matching fill words', () => {
      const templates = promptGenerator.promptData.templates;
      const fillWords = promptGenerator.promptData.fillWords;
      const missingCategories = [];
      
      templates.forEach(template => {
        const matches = template.match(/\{(\w+)\}/g);
        if (matches) {
          matches.forEach(match => {
            const type = match.replace(/[{}]/g, '');
            if (!fillWords[type]) {
              missingCategories.push({ template, type });
            }
          });
        }
      });
      
      expect(missingCategories).toEqual([]);
    });
  });

  describe('Prompt Quality', () => {
    test('generated prompts are non-empty strings', () => {
      const prompts = promptGenerator.generateUniquePrompts(10);
      
      prompts.forEach(prompt => {
        expect(typeof prompt).toBe('string');
        expect(prompt.trim().length).toBeGreaterThan(0);
      });
    });

    test('generated prompts do not contain unresolved placeholders', () => {
      // Generate many prompts to test thoroughly
      const prompts = promptGenerator.generateUniquePrompts(50);
      
      prompts.forEach(prompt => {
        // Check for common placeholder types that should be resolved
        expect(prompt).not.toMatch(/\{noun\}/);
        expect(prompt).not.toMatch(/\{adjective\}/);
        expect(prompt).not.toMatch(/\{place\}/);
        expect(prompt).not.toMatch(/\{event\}/);
        expect(prompt).not.toMatch(/\{activity\}/);
      });
    });

    test('prompts have reasonable length', () => {
      const prompts = promptGenerator.generateUniquePrompts(20);
      
      prompts.forEach(prompt => {
        expect(prompt.length).toBeGreaterThan(10);
        expect(prompt.length).toBeLessThan(200);
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles generating 0 prompts', () => {
      const prompts = promptGenerator.generateUniquePrompts(0);
      expect(prompts).toEqual([]);
    });

    test('handles generating 1 prompt', () => {
      const prompts = promptGenerator.generateUniquePrompts(1);
      expect(prompts.length).toBe(1);
    });

    test('getPromptsNeededForRound with 0 players', () => {
      expect(promptGenerator.getPromptsNeededForRound(0, 2)).toBe(0);
    });

    test('getPromptsNeededForRound with 0 prompts per player', () => {
      expect(promptGenerator.getPromptsNeededForRound(4, 0)).toBe(0);
    });
  });

  describe('Last Wit Modes', () => {
    describe('Mode Selection', () => {
      test('LW-001: selectRandomLastWitMode returns valid mode', () => {
        const mode = promptGenerator.selectRandomLastWitMode();
        
        expect(Object.values(LAST_WIT_MODES)).toContain(mode);
      });

      test('LW-002: selectRandomLastWitMode returns different modes over time', () => {
        const modes = new Set();
        
        // Run multiple times to check randomness
        for (let i = 0; i < 50; i++) {
          modes.add(promptGenerator.selectRandomLastWitMode());
        }
        
        // Should have hit at least 2 different modes
        expect(modes.size).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Flashback Lash', () => {
      test('LW-003: generateFlashbackPrompt returns story setup', () => {
        const result = promptGenerator.generateFlashbackPrompt();
        
        expect(typeof result).toBe('object');
        expect(result.prompt).toBeDefined();
        expect(typeof result.prompt).toBe('string');
        expect(result.prompt.length).toBeGreaterThan(0);
        // Flashback prompts should be narrative setups (ending with ... or similar)
        expect(result.prompt).toMatch(/\.\.\.$/);
        expect(result.mode).toBe(LAST_WIT_MODES.FLASHBACK);
      });

      test('LW-004: generateFlashbackPrompt returns unique prompts', () => {
        const usedPrompts = new Set();
        const prompts = [];
        
        for (let i = 0; i < 10; i++) {
          const result = promptGenerator.generateFlashbackPrompt(usedPrompts);
          prompts.push(result.prompt);
          usedPrompts.add(result.prompt);
        }
        
        // All should be unique
        expect(new Set(prompts).size).toBe(10);
      });
    });

    describe('Word Lash', () => {
      test('LW-005: generateWordLashPrompt returns exactly 3 letters', () => {
        const result = promptGenerator.generateWordLashPrompt();
        
        expect(result.letters).toBeDefined();
        expect(Array.isArray(result.letters)).toBe(true);
        expect(result.letters.length).toBe(3);
        result.letters.forEach(letter => {
          expect(letter).toMatch(/^[A-Z]$/);
        });
      });

      test('LW-006: generateWordLashPrompt has correct prompt format', () => {
        const result = promptGenerator.generateWordLashPrompt();
        
        // Letters array should appear in prompt (joined with '. ')
        expect(result.prompt).toContain(result.letters.join('. '));
        expect(result.mode).toBe(LAST_WIT_MODES.WORD_LASH);
        expect(result.instructions).toBeDefined();
      });

      test('LW-007: generateWordLashPrompt returns different letters', () => {
        const letterSets = new Set();
        
        for (let i = 0; i < 20; i++) {
          const result = promptGenerator.generateWordLashPrompt();
          letterSets.add(result.letters.join(''));
        }
        
        // Should have variation
        expect(letterSets.size).toBeGreaterThan(1);
      });
    });

    describe('Acro Lash', () => {
      test('LW-008: generateAcroLashPrompt returns 3-5 letters', () => {
        const lengths = new Set();
        
        for (let i = 0; i < 30; i++) {
          const result = promptGenerator.generateAcroLashPrompt();
          expect(Array.isArray(result.letters)).toBe(true);
          expect(result.letters.length).toBeGreaterThanOrEqual(3);
          expect(result.letters.length).toBeLessThanOrEqual(5);
          lengths.add(result.letters.length);
        }
        
        // Should hit different lengths
        expect(lengths.size).toBeGreaterThan(1);
      });

      test('LW-009: generateAcroLashPrompt has correct format', () => {
        const result = promptGenerator.generateAcroLashPrompt();
        
        result.letters.forEach(letter => {
          expect(letter).toMatch(/^[A-Z]$/);
        });
        expect(result.prompt).toContain(result.letters.join('. '));
        expect(result.mode).toBe(LAST_WIT_MODES.ACRO_LASH);
        expect(result.instructions).toBeDefined();
      });
    });

    describe('Last Wit Prompt Generation', () => {
      test('LW-010: generateLastWitPrompt returns object with mode', () => {
        const usedPrompts = new Set();
        const result = promptGenerator.generateLastWitPrompt(usedPrompts);
        
        expect(result.mode).toBeDefined();
        expect(Object.values(LAST_WIT_MODES)).toContain(result.mode);
        expect(result.prompt).toBeDefined();
        expect(typeof result.prompt).toBe('string');
      });

      test('LW-011: generateLastWitPrompt includes letters for word/acro modes', () => {
        // Generate multiple to hit different modes
        for (let i = 0; i < 30; i++) {
          const result = promptGenerator.generateLastWitPrompt(new Set());
          
          if (result.mode === LAST_WIT_MODES.WORD_LASH || result.mode === LAST_WIT_MODES.ACRO_LASH) {
            expect(result.letters).toBeDefined();
            expect(result.letters.length).toBeGreaterThanOrEqual(3);
          }
        }
      });

      test('LW-012: generateLastWitPrompt includes instructions', () => {
        const result = promptGenerator.generateLastWitPrompt(new Set());
        
        expect(result.instructions).toBeDefined();
        expect(typeof result.instructions).toBe('string');
        expect(result.instructions.length).toBeGreaterThan(0);
      });
    });

    describe('Answer Validation', () => {
      test('LW-013: validateWordLashAnswer passes correct answers', () => {
        const result = promptGenerator.validateWordLashAnswer('Take Flight Now', ['T', 'F', 'N']);
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });

      test('LW-014: validateWordLashAnswer is case-insensitive', () => {
        const result = promptGenerator.validateWordLashAnswer('take flight now', ['T', 'F', 'N']);
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });

      test('LW-015: validateWordLashAnswer rejects wrong letters', () => {
        const result = promptGenerator.validateWordLashAnswer('Wrong Answer Here', ['T', 'F', 'N']);
        
        expect(result.valid).toBe(false);
        expect(result.message).not.toBeNull();
      });

      test('LW-016: validateWordLashAnswer handles empty answer', () => {
        const result = promptGenerator.validateWordLashAnswer('', ['T', 'F', 'N']);
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });

      test('LW-017: validateAcroLashAnswer passes correct answers', () => {
        const result = promptGenerator.validateAcroLashAnswer('Laughing Out Loud', 'LOL');
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });

      test('LW-018: validateAcroLashAnswer is case-insensitive', () => {
        const result = promptGenerator.validateAcroLashAnswer('laughing out loud', 'LOL');
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });

      test('LW-019: validateAcroLashAnswer rejects wrong letters', () => {
        const result = promptGenerator.validateAcroLashAnswer('Wrong Answer Here', 'LOL');
        
        expect(result.valid).toBe(false);
        expect(result.message).not.toBeNull();
      });

      test('LW-020: validateAcroLashAnswer requires enough words', () => {
        const result = promptGenerator.validateAcroLashAnswer('Only Two', 'LOL');
        
        expect(result.valid).toBe(false);
        expect(result.message).not.toBeNull();
        expect(result.message).toMatch(/3 words/);
      });

      test('LW-021: validateAcroLashAnswer handles longer acronyms', () => {
        const result = promptGenerator.validateAcroLashAnswer('Super Cool Really Amazing Words', 'SCRAW');
        
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
      });
    });
  });
});
