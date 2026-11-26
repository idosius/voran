import { fireEvent, screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
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

function visibleLabels(): string[] {
  return screen.queryAllByRole('option').map((item) => item.textContent);
}

function arrow(): HTMLElement {
  return screen.getByRole('button', { name: 'Show all options' });
}

const state = { input: mount('lang') };

beforeEach(() => {
  state.input = mount('lang');
  attachCombobox(state.input, OPTIONS);
});

describe('attachCombobox', () => {
  it('cancels mousedown on the arrow and the options so the input keeps focus (Firefox)', async () => {
    await userEvent.click(arrow());
    // fireEvent returns false when the default action (moving focus) was prevented.
    expect(fireEvent.mouseDown(arrow())).toBe(false);
    expect(fireEvent.mouseDown(screen.getByRole('option', { name: 'English' }))).toBe(false);
  });

  it('always renders the arrow button and starts closed', () => {
    expect(arrow()).toBeInTheDocument();
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows every option from the arrow even when the input already has a value', async () => {
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox'), 'English{Escape}');
    await user.click(arrow());
    expect(visibleLabels()).toEqual(OPTIONS);
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('English');
  });

  it('closes when the arrow is clicked again', async () => {
    const user = userEvent.setup();
    await user.click(arrow());
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.click(arrow());
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });

  it('filters while typing, by English or native name', async () => {
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.type(input, 'deu');
    expect(visibleLabels()).toEqual(['German — Deutsch']);
    await user.clear(input);
    await user.type(input, 'ελλ');
    expect(visibleLabels()).toEqual(['Greek — Ελληνικά']);
  });

  it('closes when nothing matches', async () => {
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });

  it('picks with the keyboard', async () => {
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    let changed = 0;
    input.addEventListener('change', () => {
      changed += 1;
    });
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(input).toHaveValue('English');
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
    expect(changed).toBe(1);
  });

  it('wraps around with the arrow keys', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Greek — Ελληνικά');
  });

  it('picks with a click', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('option', { name: 'German — Deutsch' }));
    expect(screen.getByRole('combobox')).toHaveValue('German — Deutsch');
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });

  it('closes on Escape and blur, and ignores Enter when closed', async () => {
    const user = userEvent.setup();
    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('');
    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
  });

  it('renders option text as text, not HTML', () => {
    attachCombobox(mount('x'), ['<b>bold</b>']);
    expect(screen.getByRole('option', { name: '<b>bold</b>', hidden: true })).toBeInTheDocument();
    expect(screen.queryByText('bold', { selector: 'b' })).not.toBeInTheDocument();
  });

  it('needs a wrapper', () => {
    expect(() => {
      attachCombobox(document.createElement('input'), []);
    }).toThrow(TypeError);
  });
});
