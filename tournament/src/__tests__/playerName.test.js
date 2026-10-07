import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PlayerName, { hasGoldName } from '../PlayerName';

// The gold list arrives from the database; here the test feeds it in.
let pushGoldNames;
jest.mock('../api/nameStyles', () => ({
  subscribeToGoldNames: (onChange) => {
    pushGoldNames = onChange;
    return () => {};
  },
}));

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

test('a golden name is matched whatever its capitalisation', () => {
  const names = new Set(['mr6star']);
  expect(hasGoldName(names, 'Mr6Star')).toBe(true);
  expect(hasGoldName(names, 'MR6STAR')).toBe(true);
  expect(hasGoldName(names, 'Mr6Sta')).toBe(false);
  expect(hasGoldName(names, null)).toBe(false);
});

test('names turn gold when staff award it, and back when they take it away', async () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<><PlayerName name="Mr6Star" /><PlayerName name="Someone" /></>));
  const [star, other] = el.querySelectorAll('span');
  expect(star.textContent).toBe('Mr6Star');
  expect(star.className).not.toContain('gold-name');

  await act(async () => pushGoldNames(['mr6star']));
  expect(star.className).toContain('gold-name');
  expect(other.className).not.toContain('gold-name');

  await act(async () => pushGoldNames([]));
  expect(star.className).not.toContain('gold-name');
  await act(async () => root.unmount());
});
