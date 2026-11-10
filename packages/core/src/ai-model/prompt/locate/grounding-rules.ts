export function locateGroundingRules() {
  return `## Important Notes for Locating Elements:
- First identify the target primitive from the user's description, then locate that primitive only. Treat labels, owners, rows, columns, and surrounding text as context unless the description says they are the target.
- If the target itself is visible text, link text, status text, table cell text, or header text, return only the tight visible text region, not the entire control, row, sentence, or container.
- If a text or link target wraps across multiple lines, do not return one large box covering the whole wrapped text. Return a tight box around a distinctive visible segment of the target text; for CJK link labels, the first 2-4 visible characters are enough when unique.
- If the target is an input/select/filter field body, current value area, or blank field region, return that field/control body or value region. Do not retarget to a trailing search icon, dropdown arrow, clear button, or nearby table header.
- If the target is an icon, arrow, checkbox, radio, or accessory control, return only that glyph/control region. Do not return adjacent owner text.
- If the target is a tiny icon/control among adjacent similar icons, use the described local order or relative position within that group and return only that glyph/control.
- If the same text appears in multiple regions, obey the described owner region first, such as filter bar vs table header.`;
}
