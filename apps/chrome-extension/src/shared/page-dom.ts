export function isVisible(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open) {
      const summary = parent.querySelector(':scope > summary');
      if (!summary?.contains(element)) return false;
    }
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return element.getClientRects().length > 0;
}

/** Present in the DOM and operable, without requiring layout (works before paint). */
export function isUsable(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  return !(element as HTMLInputElement).disabled;
}

export function controlLabel(element: Element): string {
  return (
    element.getAttribute('aria-label') ||
    element.textContent ||
    (element as HTMLInputElement).value ||
    ''
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const clean = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();

/** Text of an element excluding nested form controls and popup option lists. */
const NON_TEXT = 'input, select, textarea, [role="listbox"], [role="option"], [aria-hidden="true"]';

/**
 * Text of an element excluding nested form controls and popup option lists. Separate text
 * nodes are joined with spaces, so a caption <span>Month</span> next to a value
 * <span>June</span> reads "Month June" rather than "MonthJune".
 */
export function ownText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(NON_TEXT).forEach((node) => node.remove());
  const parts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    parts.push(node.nodeValue || '');
  return clean(parts.join(' '));
}

/**
 * Resolves a control's accessible name the way assistive tech does in practice:
 * aria-labelledby, aria-label, <label for>/wrapping <label>, placeholder, title,
 * then (for text inputs and comboboxes) a short caption in the surrounding field container.
 */
export function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' '),
    );
    if (text) return text;
  }
  const aria = clean(element.getAttribute('aria-label'));
  if (aria) return aria;

  const labels = (element as HTMLInputElement).labels;
  if (labels?.length) {
    const text = clean([...labels].map((label) => ownText(label)).join(' '));
    if (text) return text;
  } else if (element.id) {
    const label = [...document.querySelectorAll<HTMLLabelElement>('label[for]')].find(
      (candidate) => candidate.htmlFor === element.id,
    );
    if (label && ownText(label)) return ownText(label);
  }
  const wrapping = element.closest('label');
  if (wrapping && ownText(wrapping)) return ownText(wrapping);

  const placeholder = clean(element.getAttribute('placeholder') || element.getAttribute('title'));
  if (placeholder) return placeholder;

  if (element.getAttribute('role') === 'combobox') {
    const text = ownText(element);
    if (text) return text;
  }

  // Material text fields render the caption as a sibling <div> inside the field wrapper.
  let container = element.parentElement;
  for (let depth = 0; container && depth < 3; depth++, container = container.parentElement) {
    if (container.querySelectorAll('input, select, [role="combobox"]').length > 1) break;
    const text = ownText(container);
    if (text) return text.length <= 24 ? text : '';
  }
  return '';
}
