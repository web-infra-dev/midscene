/** Reveal a section before the browser or router scrolls to its heading/alias. */
export function revealModelConfigSection(
  section: HTMLDetailsElement,
  hash: string,
): boolean {
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return false;
  }
  const target = section.ownerDocument.getElementById(id);
  if (!target || !section.contains(target)) return false;
  section.open = true;
  return true;
}
