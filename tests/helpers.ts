/**
Every mounted `<voran-root>` host. The host sits outside any role tree, so it is found by tag with a
tree walk rather than a selector.
*/
export function hosts(): HTMLElement[] {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      node instanceof HTMLElement && node.localName === 'voran-root'
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const found: HTMLElement[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof HTMLElement) {
      found.push(node);
    }
  }
  return found;
}

/**
The shadow root of the mounted `<voran-root>` host, typed as an element because Testing Library's
`within` only accepts HTMLElement although its queries work on any query root.
*/
export function shadowRoot(): HTMLElement {
  const root = hosts()[0]?.shadowRoot;
  if (root === null || root === undefined) {
    throw new Error('modal not mounted');
  }
  return root as unknown as HTMLElement;
}

/**
The first text node inside an element. Ranges need text nodes, which Testing Library does not query.
*/
export function textNodeOf(element: Element): Text {
  const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
  if (!(text instanceof Text)) {
    throw new TypeError('element has no text node');
  }
  return text;
}
