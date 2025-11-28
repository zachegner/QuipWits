/**
 * Unit Tests for Prompt Generator (server/promptGenerator.js)
 * Tests: Template processing, unique generation, fill words
 */

const promptGenerator = require('../../server/promptGenerator');

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
});
