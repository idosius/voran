import { screen, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModal, showApproval, showPending, showToast } from '../src/modal';
import { hosts, shadowRoot } from './helpers';

beforeEach(() => {
  for (const host of hosts()) {
    host.remove();
  }
});

function pixels(value: string): number {
  return Number(value.replace('px', ''));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createModal', () => {
  it('renders a diff as text, never as HTML', () => {
    const modal = createModal(document);
    modal.showResult('a <img src=x onerror=alert(1)>', 'b <b>', []);

    const view = within(shadowRoot());
    expect(view.queryByRole('img')).not.toBeInTheDocument();
    expect(view.getAllByRole('deletion')[0]).toHaveTextContent('a');
    expect(view.getAllByRole('insertion')[0]).toHaveTextContent('b');
    expect(view.getByRole('group', { name: 'Corrected text' })).toHaveTextContent(
      '<img src=x onerror=alert(1)',
    );
  });

  it('shows the detected language as text, with or without segments', () => {
    createModal(document).showResult('a', 'b', [], 'German <b>');
    expect(within(shadowRoot()).getByText('Detected language: German <b>')).toBeInTheDocument();
    for (const host of hosts()) {
      host.remove();
    }
    createModal(document).showResult(
      'a',
      'b',
      [{ original: 'a', fixed: 'b', reason: 'r' }],
      'French',
    );
    expect(within(shadowRoot()).getByText('Detected language: French')).toBeInTheDocument();
  });

  it('shows no language line when none was detected', () => {
    createModal(document).showResult('a', 'b', []);
    expect(within(shadowRoot()).queryByText(/Detected language/u)).not.toBeInTheDocument();
  });

  it('lets the text direction follow the content', () => {
    createModal(document).showResult('مرحبا', 'مرحبا بك', []);
    expect(within(shadowRoot()).getByRole('group', { name: 'Corrected text' })).toHaveAttribute(
      'dir',
      'auto',
    );
  });

  it('shows whitespace-only changes as visible glyphs', () => {
    const modal = createModal(document);
    modal.showResult('a  b', 'a\tb\n', []);
    const view = within(shadowRoot());
    expect(view.getByRole('deletion')).toHaveTextContent('··');
    expect(view.getByText(/→/u, { selector: 'ins' })).toBeInTheDocument();
  });

  it('shows no list and no hover targets without segments', () => {
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    const view = within(shadowRoot());
    expect(view.queryByRole('list')).not.toBeInTheDocument();
    expect(view.queryByRole('group', { name: /^Correction:/ })).not.toBeInTheDocument();
  });

  describe('reason tooltip', () => {
    const SEGMENTS = [
      { text: 'Die Kinder ' },
      { original: 'spielt', fixed: 'spielen', reason: 'verb <i>agreement</i>' },
      { text: '.' },
    ];

    function open(): { change: HTMLElement; tooltip: HTMLElement } {
      const modal = createModal(document);
      modal.showResult('Die Kinder spielt.', 'Die Kinder spielen.', SEGMENTS);
      const view = within(shadowRoot());
      return {
        change: view.getByRole('group', { name: 'Correction: spielt → spielen' }),
        tooltip: view.getByRole('tooltip', { hidden: true }),
      };
    }

    it('wraps each correction, with the mistake and the fix, and no bullet list', () => {
      const { change } = open();
      const view = within(shadowRoot());
      expect(view.getByRole('deletion')).toHaveTextContent('spielt');
      expect(view.getByRole('insertion')).toHaveTextContent('spielen');
      expect(change).toHaveAttribute('tabindex', '0');
      expect(view.queryByRole('list')).not.toBeInTheDocument();
      expect(view.getByRole('group', { name: 'Corrected text' })).toHaveTextContent(
        /^Die Kinder spieltspielen\.$/,
      );
    });

    it('is hidden until hovered, then shows the reason as text', async () => {
      const user = userEvent.setup();
      const { change, tooltip } = open();
      expect(tooltip).not.toBeVisible();

      await user.hover(within(shadowRoot()).getByRole('deletion'));
      expect(tooltip).toBeVisible();
      expect(tooltip).toHaveTextContent('verb <i>agreement</i>');
      expect(
        within(shadowRoot()).queryByText('agreement', { selector: 'i' }),
      ).not.toBeInTheDocument();
      expect(change).toHaveAttribute('aria-describedby', tooltip.id);

      await user.hover(within(shadowRoot()).getByRole('insertion'));
      expect(tooltip).toBeVisible();
    });

    it('hides when the pointer leaves the text or moves to unchanged text', async () => {
      const user = userEvent.setup();
      const { change, tooltip } = open();
      await user.hover(change);
      await user.hover(within(shadowRoot()).getByText('Die Kinder'));
      expect(tooltip).not.toBeVisible();
      expect(change).not.toHaveAttribute('aria-describedby');

      await user.hover(change);
      await user.unhover(within(shadowRoot()).getByRole('group', { name: 'Corrected text' }));
      expect(tooltip).not.toBeVisible();
    });

    it('shows on keyboard focus and hides on blur', () => {
      const { change, tooltip } = open();
      change.focus();
      expect(tooltip).toBeVisible();
      change.blur();
      expect(tooltip).not.toBeVisible();
    });
  });

  it('says so when nothing changed', () => {
    const modal = createModal(document);
    modal.showResult('a', 'a', []);
    expect(within(shadowRoot()).getByText('No corrections needed.')).toBeInTheDocument();
  });

  it('applies via the Apply correction button', async () => {
    const user = userEvent.setup();
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    await user.click(within(shadowRoot()).getByRole('button', { name: 'Apply correction' }));
    await expect(modal.closed).resolves.toBe('apply');
    expect(hosts()).toHaveLength(0);
  });

  it.each([
    ['plain diff', []],
    ['segments', [{ original: 'a', fixed: 'b', reason: 'r' }]],
  ])('cancels via the Cancel button (%s)', async (_name, segments) => {
    const user = userEvent.setup();
    const modal = createModal(document);
    modal.showResult('a', 'b', segments);
    expect(
      within(shadowRoot())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel', 'Apply correction']);
    await user.click(within(shadowRoot()).getByRole('button', { name: 'Cancel' }));
    await expect(modal.closed).resolves.toBe('cancel');
    expect(hosts()).toHaveLength(0);
  });

  describe('Enter', () => {
    const SEGMENTS = [{ original: 'a', fixed: 'b', reason: 'r' }];

    it('applies when focus is in the dialog', async () => {
      const user = userEvent.setup();
      const modal = createModal(document);
      modal.showResult('a', 'b', SEGMENTS);
      await user.click(within(shadowRoot()).getByRole('heading', { name: 'Voran' }));
      await user.keyboard('{Enter}');
      await expect(modal.closed).resolves.toBe('apply');
      expect(hosts()).toHaveLength(0);
    });

    it('ignores modifiers, IME composition and a focused correction', async () => {
      const user = userEvent.setup();
      const modal = createModal(document);
      modal.showResult('a', 'b', SEGMENTS);
      await user.click(within(shadowRoot()).getByRole('heading', { name: 'Voran' }));
      await user.keyboard('{Shift>}{Enter}{/Shift}{Control>}{Enter}{/Control}');
      await user.keyboard('{Alt>}{Enter}{/Alt}{Meta>}{Enter}{/Meta}');
      await user.click(within(shadowRoot()).getByRole('group', { name: 'Correction: a → b' }));
      await user.keyboard('{Enter}');
      expect(hosts()).toHaveLength(1);
    });

    it('ignores Enter while an IME is composing', async () => {
      const user = userEvent.setup();
      const modal = createModal(document);
      modal.showResult('a', 'b', SEGMENTS);
      const heading = within(shadowRoot()).getByRole('heading', { name: 'Voran' });
      await user.click(heading);
      // user-event cannot start an IME composition, so send the event the browser would.
      heading.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      );
      expect(hosts()).toHaveLength(1);
    });

    it('leaves Enter in the page alone', async () => {
      const user = userEvent.setup();
      const page = document.createElement('textarea');
      page.setAttribute('aria-label', 'Page field');
      document.body.append(page);
      const modal = createModal(document);
      modal.showResult('a', 'b', SEGMENTS);
      await user.click(screen.getByRole('textbox', { name: 'Page field' }));
      await user.keyboard('x{Enter}y');
      expect(screen.getByRole('textbox', { name: 'Page field' })).toHaveValue('x\ny');
      expect(hosts()).toHaveLength(1);
      page.remove();
    });

    it('cancels via a focused Cancel button', async () => {
      const user = userEvent.setup();
      const modal = createModal(document);
      modal.showResult('a', 'b', []);
      // Press without release focuses the button without clicking it.
      await user.pointer({
        keys: '[MouseLeft>]',
        target: within(shadowRoot()).getByRole('button', { name: 'Cancel' }),
      });
      await user.keyboard('{Enter}');
      await expect(modal.closed).resolves.toBe('cancel');
    });
  });

  it('closes without applying when nothing changed', async () => {
    const user = userEvent.setup();
    const modal = createModal(document);
    modal.showResult('a', 'a', []);
    expect(within(shadowRoot()).getAllByRole('button')).toHaveLength(1);
    await user.click(within(shadowRoot()).getByRole('button', { name: 'Close' }));
    await expect(modal.closed).resolves.toBe('cancel');
  });

  it('labels the primary button by what it does', () => {
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    expect(
      within(shadowRoot()).getByRole('button', { name: 'Apply correction' }),
    ).toBeInTheDocument();
    modal.showResult('a', 'a', []);
    expect(within(shadowRoot()).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('draws a visible border around the dialog', () => {
    createModal(document);
    const css = within(shadowRoot()).getByText(/\.dialog/, { selector: 'style', ignore: false });
    expect(css).toHaveTextContent(/\.dialog\s*\{[^}]*border: 1px solid/);
  });

  it('cancels on Escape and removes the listener', async () => {
    const user = userEvent.setup();
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    await user.keyboard('{Escape}');
    await expect(modal.closed).resolves.toBe('cancel');
    expect(hosts()).toHaveLength(0);

    // A leftover listener would swallow the page's own Escape handling.
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', pageHandler);
    expect(pageHandler).toHaveBeenCalledOnce();
  });

  it('cancels on backdrop click but not on dialog click', async () => {
    const user = userEvent.setup();
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    await user.click(within(shadowRoot()).getByRole('dialog'));
    expect(hosts()).toHaveLength(1);
    await user.click(within(shadowRoot()).getByRole('presentation'));
    await expect(modal.closed).resolves.toBe('cancel');
    expect(hosts()).toHaveLength(0);
  });

  it('shows an error with an optional action', async () => {
    const user = userEvent.setup();
    const modal = createModal(document);
    const run = vi.fn();
    modal.showError('No API key set.', { label: 'Open options', run });
    expect(within(shadowRoot()).getByText('No API key set.')).toBeInTheDocument();
    expect(
      within(shadowRoot())
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Open options', 'Close']);
    await user.click(within(shadowRoot()).getByRole('button', { name: 'Open options' }));
    expect(run).toHaveBeenCalledOnce();

    modal.showError('Plain error');
    expect(within(shadowRoot()).getAllByRole('button')).toHaveLength(1);
  });
});

describe('showToast', () => {
  it('shows then removes the toast', () => {
    vi.useFakeTimers();
    showToast(document, 'Copied', 1000);
    expect(within(shadowRoot()).getByText('Copied')).toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    expect(hosts()).toHaveLength(0);
  });
});

describe('showPending', () => {
  it('shows a non-modal pill until dismissed', () => {
    const dismiss = showPending(document);
    const view = within(shadowRoot());
    expect(view.getByRole('status')).toHaveTextContent('Checking');
    expect(view.queryByRole('presentation')).not.toBeInTheDocument();
    expect(view.getByRole('status')).not.toHaveAttribute('style');
    dismiss();
    expect(hosts()).toHaveLength(0);
  });

  it('appears next to the mouse when a point is given', () => {
    const dismiss = showPending(document, { x: 100, y: 200 });
    expect(within(shadowRoot()).getByRole('status')).toHaveStyle({
      left: '112px',
      top: '216px',
      bottom: 'auto',
    });
    dismiss();
  });

  it('covers the text when given an anchor', () => {
    const dismiss = showPending(document, { top: 300, left: 100, width: 200, height: 20 });
    // jsdom reports a zero-size pill: centred on the anchor's centre (200, 310).
    expect(within(shadowRoot()).getByRole('status')).toHaveStyle({ left: '200px', top: '310px' });
    dismiss();
  });

  it('keeps the corner pill for an anchor without area', () => {
    const dismiss = showPending(document, { top: 0, left: 0, width: 0, height: 0 });
    expect(within(shadowRoot()).getByRole('status')).not.toHaveAttribute('style');
    dismiss();
  });

  it('stays on screen when the mouse is at the viewport edge', () => {
    const dismiss = showPending(document, {
      x: window.innerWidth + 500,
      y: window.innerHeight + 500,
    });
    const pill = within(shadowRoot()).getByRole('status');
    expect(pixels(getComputedStyle(pill).left)).toBeLessThanOrEqual(window.innerWidth);
    expect(pixels(getComputedStyle(pill).top)).toBeLessThanOrEqual(window.innerHeight);
    dismiss();
  });
});

describe('showApproval', () => {
  it('shows only a checkmark centred over the anchor, then removes itself', () => {
    vi.useFakeTimers();
    showApproval(document, { top: 300, left: 100, width: 200, height: 20 }, 1000);
    const view = within(shadowRoot());
    const badge = view.getByRole('status', { name: 'Text is correct' });
    expect(badge).toHaveTextContent('✓');
    expect(badge).toHaveStyle({ top: '296px' });
    expect(view.queryByRole('presentation')).not.toBeInTheDocument();
    vi.advanceTimersByTime(1000);
    expect(hosts()).toHaveLength(0);
  });

  it('treats a real DOMRect as an anchor, not a mouse point', () => {
    vi.useFakeTimers();
    showApproval(document, new DOMRect(100, 300, 200, 20));
    expect(within(shadowRoot()).getByRole('status')).toHaveStyle({ top: '296px', left: '200px' });
  });

  it('appears where the pending pill was when given a mouse point', () => {
    vi.useFakeTimers();
    showApproval(document, { x: 100, y: 200 });
    expect(within(shadowRoot()).getByRole('status')).toHaveStyle({ top: '216px', left: '126px' });
  });

  it('falls back to the viewport centre without a usable anchor', () => {
    vi.useFakeTimers();
    showApproval(document, null);
    expect(within(shadowRoot()).getByRole('status')).toHaveStyle({
      top: `${String(window.innerHeight / 2)}px`,
    });
    showApproval(document, { top: 0, left: 0, width: 0, height: 0 });
    expect(hosts()).toHaveLength(2);
  });

  it('keeps the badge on screen when the anchor is above the viewport', () => {
    vi.useFakeTimers();
    showApproval(document, { top: -500, left: -500, width: 10, height: 10 });
    const badge = within(shadowRoot()).getByRole('status');
    expect(badge).toHaveStyle({ top: '8px' });
    expect(pixels(getComputedStyle(badge).left)).toBeGreaterThan(0);
  });
});
