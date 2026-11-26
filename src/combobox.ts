const CLASS_OPEN = 'open';

/**
Turns a text input into an always-visible dropdown with autocomplete. The arrow button and the
Down key open the full list whatever the input says; typing filters it. The page only needs the
input inside a `.combo` wrapper; the button and list are created here. Text is set with
`textContent`, never parsed as HTML.
*/
export function attachCombobox(
  input: HTMLInputElement,
  options: readonly string[],
  doc: Document = document,
): void {
  const wrapper = input.parentElement;
  if (wrapper === null) {
    throw new TypeError('Combobox input needs a wrapper element');
  }

  const list = doc.createElement('ul');
  list.id = `${input.id}-listbox`;
  list.className = 'combo-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'combo-button';
  button.tabIndex = -1;
  button.setAttribute('aria-label', 'Show all options');
  button.textContent = '▾';

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  wrapper.append(button, list);

  const items = options.map((label, index) => {
    const item = doc.createElement('li');
    item.id = `${input.id}-option-${String(index)}`;
    item.setAttribute('role', 'option');
    item.textContent = label;
    list.append(item);
    return item;
  });

  let visible: HTMLLIElement[] = [];
  let active = -1;
  const isOpen = (): boolean => list.hidden === false;

  const setActive = (index: number): void => {
    active = index;
    for (const [position, item] of visible.entries()) {
      const isActive = position === index;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
    const current = index < 0 ? undefined : visible.at(index);
    input.setAttribute('aria-activedescendant', current?.id ?? '');
  };

  const close = (): void => {
    list.hidden = true;
    wrapper.classList.remove(CLASS_OPEN);
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };

  const open = (filter: string): void => {
    const wanted = filter.trim().toLowerCase();
    visible = items.filter((item) => {
      const show = wanted === '' || item.textContent.toLowerCase().includes(wanted);
      item.hidden = !show;
      return show;
    });
    if (visible.length === 0) {
      close();
      return;
    }
    list.hidden = false;
    wrapper.classList.add(CLASS_OPEN);
    input.setAttribute('aria-expanded', 'true');
    // Start on the current value so the user sees where they are in the list.
    const current = visible.findIndex((item) => item.textContent === input.value);
    // While filtering, the first match is ready for Enter.
    setActive(current === -1 && wanted !== '' ? 0 : current);
  };

  const choose = (item: HTMLLIElement): void => {
    input.value = item.textContent;
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const move = (step: number): void => {
    if (!isOpen()) {
      open('');
      return;
    }
    const count = visible.length;
    setActive(active === -1 ? (step > 0 ? 0 : count - 1) : (active + step + count) % count);
  };

  // Focus moves on mousedown. Preventing only pointerdown keeps focus in Chrome but not in Firefox,
  // where the input would blur and close the list before the click lands.
  button.addEventListener('mousedown', (event) => {
    // Keep focus where it is; the click below toggles the list.
    event.preventDefault();
  });
  button.addEventListener('click', () => {
    if (isOpen()) {
      close();
    } else {
      input.focus();
      open('');
    }
  });

  list.addEventListener('mousedown', (event) => {
    // Picking must not blur the input first, or the list would close before the click lands.
    event.preventDefault();
  });
  list.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLLIElement && items.includes(target)) {
      choose(target);
    }
  });

  input.addEventListener('input', () => {
    open(input.value);
  });
  input.addEventListener('focus', () => {
    input.select();
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        move(event.key === 'ArrowDown' ? 1 : -1);
        break;
      }
      case 'Enter': {
        const item = active < 0 ? undefined : visible.at(active);
        if (item !== undefined && isOpen()) {
          event.preventDefault();
          choose(item);
        }
        break;
      }
      case 'Escape': {
        if (isOpen()) {
          event.preventDefault();
          close();
        }
        break;
      }
      default: {
        break;
      }
    }
  });
}
