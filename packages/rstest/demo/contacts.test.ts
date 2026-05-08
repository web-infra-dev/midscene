import { createWebTest } from '@midscene/rstest/playwright';
import { describe, expect, it } from '@rstest/core';

const PAGE_URL =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/contacts3.html';

describe('Contacts page', () => {
  const ctx = createWebTest(PAGE_URL);

  it('renders the smart contacts header and grid', async () => {
    const { agent } = ctx;
    await agent.aiAssert(
      'the page header reads "Smart Contacts" with the subtitle "Midscene AI-powered Contact Management"',
    );
    await agent.aiAssert(
      'a grid of contact cards is visible, each card shows an avatar, a name, a position, and detail rows for phone, email, company, address and last contact date',
    );
  });

  it('lists every contact with the expected fields', async () => {
    const { agent } = ctx;
    const contacts = await agent.aiQuery<
      { name: string; position: string; email: string }[]
    >(
      'Array<{name: string, position: string, email: string}>, the name (heading), position (line under the name) and email address shown on every contact card',
    );

    expect(contacts).toHaveLength(5);
    const byName = Object.fromEntries(contacts.map((c) => [c.name, c]));
    expect(byName['Alice Johnson']?.position).toBe('Senior Software Engineer');
    expect(byName['Alice Johnson']?.email).toBe('alice.johnson@techcorp.com');
    expect(byName['Bob Wilson']?.position).toBe('UI/UX Designer');
    expect(byName['Carol Davis']?.position).toBe('Sales Director');
    expect(byName['David Brown']?.position).toBe('Marketing Manager');
    expect(byName['Emma Taylor']?.position).toBe('HR Manager');
  });

  it('opens the custom context menu on right-click', async () => {
    const { agent } = ctx;
    await agent.aiRightClick("Alice Johnson's contact card");
    await agent.aiWaitFor(
      'a context menu is visible with the items "Call Contact", "Send Email", "Send Message", "Edit Contact", "Copy Info" and "Delete Contact"',
      { timeoutMs: 10_000 },
    );

    const items = await agent.aiQuery<string[]>(
      'string[], the visible text of every item inside the open context menu, in order',
    );
    expect(items).toEqual([
      'Call Contact',
      'Send Email',
      'Send Message',
      'Edit Contact',
      'Copy Info',
      'Delete Contact',
    ]);
  });
});
