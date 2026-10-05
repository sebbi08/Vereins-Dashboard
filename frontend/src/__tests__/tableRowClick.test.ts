import { afterEach, describe, expect, it } from 'vitest';
import { isControlClick } from '../utils/tableRowClick';

function clickEventOn(rowHtml: string): Event {
  document.body.innerHTML = `<table><tbody><tr>${rowHtml}</tr></tbody></table>`;
  return { target: document.getElementById('t') } as unknown as Event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isControlClick', () => {
  it.each([
    ['inside a button', '<td><button><span id="t">Copy</span></button></td>'],
    ['on a link', '<td><a id="t" href="#">1 / 2026</a></td>'],
    ['on an input', '<td><input id="t" /></td>'],
    ['inside a PrimeVue checkbox', '<td><div class="p-checkbox"><div id="t"></div></div></td>'],
    ['on the selection cell', '<td id="t" data-p-selection-column="true"></td>'],
  ])('is true %s', (_, html) => {
    expect(isControlClick(clickEventOn(html))).toBe(true);
  });

  it('is false on plain cell text', () => {
    expect(isControlClick(clickEventOn('<td><span id="t">Anna Alt</span></td>'))).toBe(false);
  });

  it('is false without a target', () => {
    expect(isControlClick({ target: null } as unknown as Event)).toBe(false);
  });
});
