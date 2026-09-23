import { parseRewardLinks } from '../utils';

// Made-up codes in the same shape as real prize links - never real ones.
const row = (n) => `Goblin Explorer\thttps://link.clashofclans.com/?action=voucher&code=00000000-0000-0000-0000-00000000000${n}\tYes\t10/16/2026, 12:59 AM CDT`;
const link = (n) => `https://link.clashofclans.com/?action=voucher&code=00000000-0000-0000-0000-00000000000${n}`;

test('a plain list of links, one per line, is taken as it is', () => {
  expect(parseRewardLinks(`${link(1)}\n${link(2)}`)).toEqual({ links: [link(1), link(2)], badLines: [] });
});

test('spreadsheet rows (item, link, Yes, date separated by tabs) give just the link', () => {
  expect(parseRewardLinks(`${row(1)}\n${row(2)}\n${row(3)}`).links).toEqual([link(1), link(2), link(3)]);
});

test('a first row that lost its leading columns still works', () => {
  const firstRow = `${link(1)}\tYes\t10/16/2026, 12:59 AM CDT`;
  expect(parseRewardLinks(`${firstRow}\n${row(2)}`).links).toEqual([link(1), link(2)]);
});

test('blank lines and Windows line endings are ignored', () => {
  expect(parseRewardLinks(`\n${row(1)}\r\n\r\n${row(2)}\r\n`).links).toEqual([link(1), link(2)]);
});

test('lines with no link are reported, not silently dropped', () => {
  const result = parseRewardLinks(`${row(1)}\nGoblin Explorer\tYes`);
  expect(result.links).toEqual([link(1)]);
  expect(result.badLines).toEqual(['Goblin Explorer\tYes']);
});

test('empty input gives nothing', () => {
  expect(parseRewardLinks('')).toEqual({ links: [], badLines: [] });
  expect(parseRewardLinks(undefined)).toEqual({ links: [], badLines: [] });
});
