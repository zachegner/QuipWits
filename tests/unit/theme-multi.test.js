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
    expect(b).toEqual([{ label: 'Only', count: 4, crossover: false }]);
  });

  test('multiple themes sums to count and includes singles and combos', () => {
    const b = buildThemeLabelBuckets(8, ['A', 'B', 'C']);
    const sum = b.reduce((s, x) => s + x.count, 0);
    expect(sum).toBe(8);
    const hasCrossover = b.some(x => x.crossover);
    const hasSingle = b.some(x => !x.crossover);
    expect(hasCrossover).toBe(true);
    expect(hasSingle).toBe(true);
  });

  test('count 2 uses two singles only', () => {
    const b = buildThemeLabelBuckets(2, ['A', 'B']);
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(2);
    expect(b.every(x => !x.crossover)).toBe(true);
  });
});

describe('pickRandomThemeLabel', () => {
  test('empty themes returns null label', () => {
    expect(pickRandomThemeLabel(null).label).toBeNull();
    expect(pickRandomThemeLabel([]).label).toBeNull();
  });

  test('one theme is never crossover', () => {
    const r = pickRandomThemeLabel(['Solo']);
    expect(r.label).toBe('Solo');
    expect(r.crossover).toBe(false);
  });
});
