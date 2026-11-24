import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModal, showApproval, showPending, showToast } from '../src/modal';

function shadow(): ShadowRoot {
  const root = document.querySelector('voran-root')?.shadowRoot;
  if (!root) {
    throw new Error('modal not mounted');
  }
  return root;
}

beforeEach(() => {
  document.body.replaceChildren();
  for (const host of document.querySelectorAll('voran-root')) {
    host.remove();
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createModal', () => {
  it('renders a diff as text, never as HTML', () => {
    const modal = createModal(document);
    modal.showResult('a <img src=x onerror=alert(1)>', 'b <b>', []);

    const root = shadow();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('del.remove')?.textContent).toBe('a');
    expect(root.querySelector('ins.add')?.textContent).toBe('b');
    expect(root.querySelector('.diff')?.textContent).toContain('<img src=x onerror=alert(1)');
  });

  it('lets the text direction follow the content', () => {
    createModal(document).showResult('مرحبا', 'مرحبا بك', []);
    expect(shadow().querySelector('.diff')?.getAttribute('dir')).toBe('auto');
  });

  it('shows whitespace-only changes as visible glyphs', () => {
    const modal = createModal(document);
    modal.showResult('a  b', 'a\tb\n', []);
    const root = shadow();
    expect(root.querySelector('del')?.textContent).toBe('··');
    expect(root.querySelector('ins')?.textContent).toContain('→');
  });

  it('shows no list and no hover targets without segments', () => {
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    expect(shadow().querySelector('ul')).toBeNull();
    expect(shadow().querySelector('.change')).toBeNull();
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
      const root = shadow();
      const change = root.querySelector<HTMLElement>('.change');
      const tooltip = root.querySelector<HTMLElement>('.tooltip');
      if (!change || !tooltip) {
        throw new Error('missing change or tooltip');
      }
      return { change, tooltip };
    }

    it('wraps each correction, with the mistake and the fix, and no bullet list', () => {
      const { change } = open();
      expect(change.querySelector('del.remove')?.textContent).toBe('spielt');
      expect(change.querySelector('ins.add')?.textContent).toBe('spielen');
      expect(change.tabIndex).toBe(0);
      expect(shadow().querySelector('ul')).toBeNull();
      expect(shadow().querySelector('.diff')?.textContent).toBe('Die Kinder spieltspielen.');
    });

    it('is hidden until hovered, then shows the reason as text', () => {
      const { change, tooltip } = open();
      expect(tooltip.hidden).toBe(true);

      change.querySelector('del')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.hidden).toBe(false);
      expect(tooltip.textContent).toBe('verb <i>agreement</i>');
      expect(tooltip.querySelector('i')).toBeNull();
      expect(change.getAttribute('aria-describedby')).toBe(tooltip.id);

      change.querySelector('ins')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.hidden).toBe(false);
    });

    it('hides when the pointer leaves the text or moves to unchanged text', () => {
      const { change, tooltip } = open();
      change.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      shadow()
        .querySelector('.equal')
        ?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.hidden).toBe(true);
      expect(change.hasAttribute('aria-describedby')).toBe(false);

      change.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      shadow().querySelector('.diff')?.dispatchEvent(new MouseEvent('mouseleave'));
      expect(tooltip.hidden).toBe(true);
    });

    it('shows on keyboard focus and hides on blur', () => {
      const { change, tooltip } = open();
      change.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(tooltip.hidden).toBe(false);
      change.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(tooltip.hidden).toBe(true);
    });
  });

  it('says so when nothing changed', () => {
    const modal = createModal(document);
    modal.showResult('a', 'a', []);
    expect(shadow().textContent).toContain('No corrections needed.');
  });

  it('closes via the Close button', async () => {
    const modal = createModal(document);
    modal.showResult('a', 'b', []);
    shadow().querySelector<HTMLButtonElement>('button.primary')?.click();
    await modal.closed;
    expect(document.querySelector('voran-root')).toBeNull();
  });

  it('closes on Escape and removes the listener', async () => {
    const modal = createModal(document);
    modal.showError('x');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(document.querySelector('voran-root')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await modal.closed;
    expect(document.querySelector('voran-root')).toBeNull();
  });

  it('closes on backdrop click but not on dialog click', async () => {
    const modal = createModal(document);
    modal.showError('x');
    shadow()
      .querySelector('.dialog')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('voran-root')).not.toBeNull();
    shadow()
      .querySelector('.backdrop')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await modal.closed;
    expect(document.querySelector('voran-root')).toBeNull();
  });

  it('shows an error with an optional action', () => {
    const modal = createModal(document);
    const run = vi.fn();
    modal.showError('No API key set.', { label: 'Open options', run });
    expect(shadow().querySelector('.error')?.textContent).toBe('No API key set.');
    const buttons = [...shadow().querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Open options', 'Close']);
    buttons[0]?.click();
    expect(run).toHaveBeenCalledOnce();

    modal.showError('Plain error');
    expect(shadow().querySelectorAll('button')).toHaveLength(1);
  });
});

describe('showToast', () => {
  it('shows then removes the toast', () => {
    vi.useFakeTimers();
    showToast(document, 'Copied', 1000);
    expect(shadow().querySelector('.toast')?.textContent).toBe('Copied');
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('voran-root')).toBeNull();
  });
});

describe('showPending', () => {
  it('shows a non-modal pill until dismissed', () => {
    const dismiss = showPending(document);
    expect(shadow().textContent).toContain('Checking');
    expect(shadow().querySelector('.backdrop')).toBeNull();
    dismiss();
    expect(document.querySelector('voran-root')).toBeNull();
  });
});

describe('showApproval', () => {
  it('shows a checkmark and Jawohl! above the anchor, then removes itself', () => {
    vi.useFakeTimers();
    showApproval(document, { top: 300, left: 100, width: 200, height: 20 }, 1000);
    const badge = shadow().querySelector<HTMLElement>('.approval');
    expect(badge?.textContent).toContain('✓');
    expect(badge?.textContent).toContain('Jawohl!');
    expect(badge?.getAttribute('role')).toBe('status');
    expect(badge?.style.top).toBe('292px');
    expect(shadow().querySelector('.backdrop')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('voran-root')).toBeNull();
  });

  it('falls back to the viewport centre without a usable anchor', () => {
    vi.useFakeTimers();
    showApproval(document, null);
    const badge = shadow().querySelector<HTMLElement>('.approval');
    expect(badge?.style.top).toBe(`${String(window.innerHeight / 2)}px`);
    showApproval(document, { top: 0, left: 0, width: 0, height: 0 });
    expect(document.querySelectorAll('voran-root')).toHaveLength(2);
  });

  it('keeps the badge on screen when the anchor is above the viewport', () => {
    vi.useFakeTimers();
    showApproval(document, { top: -500, left: -500, width: 10, height: 10 });
    const badge = shadow().querySelector<HTMLElement>('.approval');
    expect(badge?.style.top).toBe('8px');
    expect(Number(badge?.style.left.replace('px', '') ?? -1)).toBeGreaterThan(0);
  });
});
