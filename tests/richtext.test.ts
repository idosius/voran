import { within } from '@testing-library/dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyEdits, extractText, planEdits } from '../src/richtext';
import { textNodeOf } from './helpers';

function setup(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.append(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
  document.body.append(div);
  return div;
}

function rangeAll(div: HTMLElement): Range {
  const range = document.createRange();
  range.selectNodeContents(div);
  return range;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('extractText', () => {
  it('reads inline formatting as one run', () => {
    const div = setup('Ich <b>habe</b> <a href="#">ein</a> Fehler');
    expect(extractText(rangeAll(div)).text).toBe('Ich habe ein Fehler');
  });

  it('turns blocks and <br> into single line breaks', () => {
    const div = setup('<p>Eins</p><p>Zwei<br>Drei</p><ul><li>Vier</li></ul>text<br><br>');
    expect(extractText(rangeAll(div)).text).toBe('Eins\nZwei\nDrei\nVier\ntext');
  });

  it('maps nbsp to space, drops zero-width characters and collapses whitespace', () => {
    const div = setup('<p> a\u{A0}b\u{200B}\n   c  </p>');
    const map = extractText(rangeAll(div));
    expect(map.text).toBe('a b c');
    expect(map.positions).toHaveLength(5);
  });

  it('keeps whitespace in preformatted text', () => {
    const div = setup('<pre>a  b\nc</pre>');
    expect(extractText(rangeAll(div)).text).toBe('a  b\nc');
  });

  it('keeps whitespace when the style asks for it', () => {
    const div = setup('<span style="white-space: pre-wrap">a  b</span>');
    expect(extractText(rangeAll(div)).text).toBe('a  b');
  });

  it('clips to the range inside a single text node', () => {
    const div = setup('Hallo Welt');
    const range = document.createRange();
    range.setStart(textNodeOf(div), 6);
    range.setEnd(textNodeOf(div), 10);
    expect(extractText(range).text).toBe('Welt');
  });

  it('clips partial first and last nodes across elements', () => {
    const div = setup('<p>Hallo</p><p>Welt</p>');
    const range = document.createRange();
    range.setStart(textNodeOf(within(div).getByText('Hallo')), 2);
    range.setEnd(textNodeOf(within(div).getByText('Welt')), 2);
    expect(extractText(range).text).toBe('llo\nWe');
  });

  it('is empty for an empty range', () => {
    const div = setup('<p>x</p>');
    const range = document.createRange();
    const text = textNodeOf(within(div).getByText('x'));
    range.setStart(text, 0);
    range.setEnd(text, 0);
    expect(extractText(range).text).toBe('');
  });
});

describe('planEdits', () => {
  it('plans nothing for identical text', () => {
    const div = setup('<p>Hallo Welt</p>');
    expect(planEdits(extractText(rangeAll(div)), 'Hallo Welt')).toEqual([]);
  });

  it('edits a word that spans formatted nodes and keeps the markup', () => {
    const div = setup('<p>Ich habe ein Fe<b>hl</b>er</p>');
    const map = extractText(rangeAll(div));
    const edits = planEdits(map, 'Ich habe ein Fehler!');
    expect(edits).not.toBeNull();
    expect(applyEdits(document, div, edits!)).toBe(true);
    expect(within(div).getByText('hl', { selector: 'b' })).toBeInTheDocument();
    expect(div).toHaveTextContent('Ich habe ein Fehler!');
  });

  it('applies several hunks, insertions and deletions', () => {
    const div = setup('<p>das Hund <b>bellt bellt</b> laut</p>');
    const map = extractText(rangeAll(div));
    const edits = planEdits(map, 'Der Hund bellt laut.');
    expect(edits).not.toBeNull();
    expect(applyEdits(document, div, edits!)).toBe(true);
    expect(div).toHaveTextContent('Der Hund bellt laut.');
    expect(within(div).getByText(/bellt/u, { selector: 'b' })).toBeInTheDocument();
  });

  it('inserts at the very start using the next character', () => {
    const div = setup('<p><b>Hund</b></p>');
    const edits = planEdits(extractText(rangeAll(div)), 'Der Hund');
    expect(applyEdits(document, div, edits!)).toBe(true);
    expect(div).toHaveTextContent('Der Hund');
  });

  it('refuses edits that add or cross line breaks', () => {
    const div = setup('<p>Ein Satz</p><p>Zwei Satz</p>');
    const map = extractText(rangeAll(div));
    expect(planEdits(map, 'Ein Satz. Zwei Sätze.')).toBeNull();
    expect(planEdits(map, 'Ein Satz\n\nZwei Satz')).toBeNull();
  });

  it('refuses edits on detached text', () => {
    const div = setup('<p>Ich habe ein Fehler</p>');
    const map = extractText(rangeAll(div));
    div.replaceChildren();
    expect(planEdits(map, 'Ich habe einen Fehler')).toBeNull();
  });

  it('refuses a hunk with no usable position', () => {
    expect(planEdits({ text: 'ab', positions: [] }, 'abc')).toBeNull();
  });
});

describe('applyEdits', () => {
  it('stops when the page detached the text meanwhile', () => {
    const div = setup('<p>Das ist ist gut</p>');
    const edits = planEdits(extractText(rangeAll(div)), 'Dies ist gut')!;
    div.replaceChildren();
    expect(applyEdits(document, div, edits)).toBe(false);
  });
});
