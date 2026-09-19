import { winChance, trophiesFor } from '../utils';

test('equal trophies is a coin flip', () => {
  expect(winChance(5000, 5000)).toBeCloseTo(0.5, 5);
});

test('the two sides always add up to 100%', () => {
  for (const [a, b] of [[6000, 5000], [5200, 5000], [7000, 3000], [4000, 4100]]) {
    expect(winChance(a, b) + winChance(b, a)).toBeCloseTo(1, 10);
  }
});

test('a bigger lead means a bigger chance, and a 1000-trophy lead is about 82%', () => {
  expect(winChance(5100, 5000)).toBeGreaterThan(0.5);
  expect(winChance(5500, 5000)).toBeGreaterThan(winChance(5100, 5000));
  expect(winChance(6000, 5000)).toBeCloseTo(0.82, 2);
});

test('nobody is ever shown as a sure thing', () => {
  expect(winChance(9000, 1000)).toBeCloseTo(0.92, 5);
  expect(winChance(1000, 9000)).toBeCloseTo(0.08, 5);
});

test('says nothing when a player\'s trophies are unknown', () => {
  expect(winChance(null, 5000)).toBeNull();
  expect(winChance(5000, undefined)).toBeNull();
});

test('prefers current trophies, falling back to what was recorded at the start', () => {
  expect(trophiesFor({ builderBaseTrophies: 5300 }, { bestBuilderBaseTrophies: 6100 })).toBe(5300);
  expect(trophiesFor(undefined, { bestBuilderBaseTrophies: 6100 })).toBe(6100);
  expect(trophiesFor(undefined, undefined)).toBeNull();
});
