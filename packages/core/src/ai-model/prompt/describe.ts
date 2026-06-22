import { getPreferredLanguage } from '@midscene/shared/env';

const examplesMap: Record<string, string[]> = {
  Chinese: [
    '"登录表单中的"登录"按钮"',
    '"搜索输入框，placeholder 为"请输入关键词""',
    '"顶部导航栏中文字为"首页"的链接"',
    '"联系表单中的提交按钮"',
    '"aria-label 为"打开菜单"的菜单图标"',
    '"左侧导航栏中当前分组标题右侧的折叠图标"',
  ],
  English: [
    '"Login button with text \'Sign In\'"',
    '"Search input with placeholder \'Enter keywords\'"',
    '"Navigation link with text \'Home\' in header"',
    '"Submit button in contact form"',
    '"Menu icon with aria-label \'Open menu\'"',
    '"Collapse icon to the right of the current section title in the left sidebar"',
  ],
};

const getExamples = (language: string) => {
  const examples = examplesMap[language] || examplesMap.English;
  return examples.map((e) => `- ${e}`).join('\n');
};

export const elementDescriberInstruction = () => {
  const preferredLanguage = getPreferredLanguage();

  return `
Describe the element in the red rectangle for precise identification.

IMPORTANT: You MUST write the description in ${preferredLanguage}.

CRITICAL REQUIREMENTS:
1. UNIQUENESS: The description must uniquely identify this element on the current page
2. UNIVERSALITY: Use generic, reusable selectors that work across different contexts
3. PRECISION: Be specific enough to distinguish from similar elements

DESCRIPTION STRUCTURE:
1. Element type (button, input, link, div, etc.)
2. Primary identifier (in order of preference):
   - Unique text content: "with text 'Login'"
   - Unique attribute: "with aria-label 'Search'"
   - Unique class/ID: "with class 'primary-button'"
   - Unique position: "in header navigation"
3. Secondary identifiers (if needed for uniqueness):
   - Visual features: "blue background", "with icon"
   - Relative position: "below search bar", "in sidebar"
   - Parent context: "in login form", "in main menu"
   - Neighboring stable text: "to the right of the 'Settings' section title"

GUIDELINES:
- Keep description under 25 words
- Prioritize semantic identifiers over visual ones
- Use consistent terminology across similar elements
- Avoid page-specific or temporary content
- Don't mention the red rectangle or selection box
- Focus on stable, reusable characteristics
- If the selected point/box is inside a text input, textarea, search box, or form field, describe the whole field/control, not the individual placeholder character, typed character, caret, or inner text fragment.
- For icon-only buttons or unlabeled controls, include the nearest stable label, section title, menu item text, row text, or parent region that owns the control.
- When multiple similar icons or controls appear in a list/sidebar/menu, the description MUST distinguish the selected one by its owning stable text or section, not by generic position such as "bottom", "nearby", or "sidebar button".
- For expand/collapse, disclosure, chevron, close, menu, and settings icons, describe both the icon purpose and the stable text/section it controls.
- Use the actual visible neighboring text from the current screenshot when available; do not copy labels from the examples.
- **Write the description in ${preferredLanguage}**

EXAMPLES:
${getExamples(preferredLanguage)}

Return JSON:
{
  "description": "unique element identifier",
  "error"?: "error message if any"
}`;
};
