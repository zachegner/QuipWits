const { parseThemes, buildThemeLabelBuckets, pickRandomThemeLabel } = require('../../server/promptGenerator');

describe('parseThemes', () => {
  test('returns null for empty input', () => {
    expect(parseThemes(null)).toBeNull();
    expect(parseThemes('')).toBeNull();
    expect(parseThemes('   ')).toBeNull();
  });

  test('splits on comma, semicolon, and newlines', () => {
    expect(parseThemes('a, b ; c')).toEqual(['a', 'b', 'c']);
    expect(parseThemes('one\ntwo')).toEqual(['one', 'two']);
  });

  test('dedupes case-insensitively', () => {
    expect(parseThemes('Star, star, STAR')).toEqual(['Star']);
  });

  test('caps number of themes', () => {
    const t = parseThemes('a,b,c,d,e,f,g,h');
    expect(t.length).toBeLessThanOrEqual(6);
  });

  test('truncates long segments', () => {
    const long = 'x'.repeat(50);
    const t = parseThemes(long);
    expect(t[0].length).toBe(40);
  });
});

describe('buildThemeLabelBuckets', () => {
  test('single theme gets one bucket', () => {
    const b = buildThemeLabelBuckets(4, ['Only']);
    expect(b).toEqual([{ label: 'Only', count: 4 }]);
  });

  test('multiple themes: all buckets are single-theme, total sums to count', () => {
    const b = buildThemeLabelBuckets(8, ['A', 'B', 'C']);
    const sum = b.reduce((s, x) => s + x.count, 0);
    expect(sum).toBe(8);
    expect(b.every(x => !x.label.includes(' and '))).toBe(true);
    // Round-robin: 8 prompts across 3 themes → 3, 3, 2
    const counts = b.map(x => x.count).sort((a, z) => z - a);
    expect(counts[0]).toBe(3);
    expect(counts[1]).toBe(3);
    expect(counts[2]).toBe(2);
  });

  test('count 2 with two themes: each theme gets one prompt', () => {
    const b = buildThemeLabelBuckets(2, ['A', 'B']);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(2);
    expect(b.every(x => !x.label.includes(' and '))).toBe(true);
  });
});

describe('pickRandomThemeLabel', () => {
  test('empty themes returns null label', () => {
    expect(pickRandomThemeLabel(null).label).toBeNull();
    expect(pickRandomThemeLabel([]).label).toBeNull();
  });

  test('one theme returns that theme', () => {
    const r = pickRandomThemeLabel(['Solo']);
    expect(r.label).toBe('Solo');
  });

  test('multiple themes always returns a single theme label (no mashup)', () => {
    const themes = ['A', 'B', 'C'];
    for (let i = 0; i < 20; i++) {
      const r = pickRandomThemeLabel(themes);
      expect(themes).toContain(r.label);
      expect(r.label).not.toMatch(/ and /);
    }
  });
});
