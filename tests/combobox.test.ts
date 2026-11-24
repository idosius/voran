import { beforeEach, describe, expect, it } from 'vitest';
import { attachCombobox } from '../src/combobox';

const OPTIONS = ['Auto-detect', 'English', 'German — Deutsch', 'Greek — Ελληνικά'];

function mount(id: string): HTMLInputElement {
  document.body.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'combo';
  const field = document.createElement('input');
  field.id = id;
  wrapper.append(field);
  document.body.append(wrapper);
  return field;
}

const state = { input: mount('lang') };

function list(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.combo-list');
  if (element === null) {
    throw new Error('no list');
  }
  return element;
}

function visibleLabels(): string[] {
  return [...list().querySelectorAll<HTMLElement>('li')]
    .filter((item) => item.hidden === false)
    .map((item) => item.textContent);
}

function key(name: string): void {
  state.input.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  state.input = mount('lang');
  attachCombobox(state.input, OPTIONS);
});

describe('attachCombobox', () => {
  it('always renders the arrow button and starts closed', () => {
    expect(document.querySelector('.combo-button')).not.toBeNull();
    expect(list().hidden).toBe(true);
    expect(state.input.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows every option from the arrow even when the input already has a value', () => {
    state.input.value = 'English';
    document.querySelector<HTMLElement>('.combo-button')?.click();
    expect(visibleLabels()).toEqual(OPTIONS);
    expect(list().querySelector('.active')?.textContent).toBe('English');
  });

  it('closes when the arrow is clicked again', () => {
    const button = document.querySelector<HTMLElement>('.combo-button');
    button?.click();
    button?.click();
    expect(list().hidden).toBe(true);
  });

  it('filters while typing, by English or native name', () => {
    state.input.value = 'deu';
    state.input.dispatchEvent(new Event('input'));
    expect(visibleLabels()).toEqual(['German — Deutsch']);
    state.input.value = 'ελλ';
    state.input.dispatchEvent(new Event('input'));
    expect(visibleLabels()).toEqual(['Greek — Ελληνικά']);
  });

  it('closes when nothing matches', () => {
    state.input.value = 'zzz';
    state.input.dispatchEvent(new Event('input'));
    expect(list().hidden).toBe(true);
  });

  it('picks with the keyboard', () => {
    let changed = 0;
    state.input.addEventListener('change', () => {
      changed += 1;
    });
    key('ArrowDown');
    expect(list().hidden).toBe(false);
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(state.input.value).toBe('English');
    expect(list().hidden).toBe(true);
    expect(changed).toBe(1);
  });

  it('wraps around with the arrow keys', () => {
    key('ArrowDown');
    key('ArrowUp');
    expect(list().querySelector('.active')?.textContent).toBe('Greek — Ελληνικά');
  });

  it('picks with a click', () => {
    key('ArrowDown');
    list().querySelectorAll('li')[2]?.click();
    expect(state.input.value).toBe('German — Deutsch');
    expect(list().hidden).toBe(true);
  });

  it('closes on Escape and blur, and ignores Enter when closed', () => {
    key('ArrowDown');
    key('Escape');
    expect(list().hidden).toBe(true);
    key('Enter');
    expect(state.input.value).toBe('');
    key('ArrowDown');
    state.input.dispatchEvent(new FocusEvent('blur'));
    expect(list().hidden).toBe(true);
  });

  it('renders option text as text, not HTML', () => {
    attachCombobox(mount('x'), ['<b>bold</b>']);
    expect(document.querySelector('b')).toBeNull();
  });

  it('needs a wrapper', () => {
    expect(() => {
      attachCombobox(document.createElement('input'), []);
    }).toThrow(TypeError);
  });
});
