import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Roulette from '../live/Roulette';
import { useMyGems } from '../live/LivePage';

// The server answers straight away and logs the spin to the feed at once;
// the page must keep both the feed and the balance quiet until the wheel stops.
let feedListener;
jest.mock('../api/nameStyles', () => ({ subscribeToGoldNames: () => () => {}, setGoldName: async () => {} }));
jest.mock('../api/live', () => ({
  spinRoulette: async () => ({ pocket: 0, landed: 'gem', payout: 3600, gems: 4500 }),
  subscribeToRecentSpins: (listener) => {
    feedListener = listener;
    listener([]);
    return () => {};
  },
  subscribeToMyGems: (uid, listener) => {
    listener(1000);
    return () => {};
  },
}));

const user = { uid: 'me', username: 'me', isGuest: false };

function Page() {
  const gems = useMyGems(user.uid);
  return (
    <>
      <p data-testid="balance">{gems}</p>
      <Roulette user={user} gems={gems} onLogin={() => {}} />
    </>
  );
}

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

test('the result stays hidden until the wheel stops', async () => {
  jest.useFakeTimers();
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<Page />));

  const balance = () => el.querySelector('[data-testid="balance"]').textContent;
  const feed = () => el.textContent.includes('No spins yet.');
  expect(balance()).toBe('1000');

  // Pick Gem, bet 100, spin.
  const button = (text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  await act(async () => button('Gem').click());
  const input = el.querySelector('input[type="number"]');
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, '100');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Spin').click());

  // Server has answered and logged the spin; the wheel is still turning.
  await act(async () => feedListener([{ id: 's1', username: 'me', pick: 'gem', landed: 'gem', amount: 100, payout: 3600, at: 1 }]));
  expect(balance()).toBe('900');
  expect(feed()).toBe(true);
  expect(el.textContent).not.toContain('You won');

  // Wheel stops: everything catches up.
  await act(async () => jest.advanceTimersByTime(5000));
  expect(balance()).toBe('1000'); // the mocked live balance (never updated in this test)
  expect(feed()).toBe(false);
  expect(el.textContent).toContain('You won');

  await act(async () => root.unmount());
  jest.useRealTimers();
});
