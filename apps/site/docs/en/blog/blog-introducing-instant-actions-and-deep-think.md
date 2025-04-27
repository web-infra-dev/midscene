---
sidebar: false
---

# Introducing Instant Actions and Deep Think

From Midscene v0.14.0, we have introduced two new features: Instant Actions and Deep Think.

## Instant Actions - A More Predictable Way to Perform Actions

You may have already been familiar with our `.ai` interface. It's an auto-planning interface to interact with web pages. For example, when performing a search, you can do this:

```typescript
await agent.ai('type "Headphones" in search box, hit Enter');
```

Behind the scene, Midscene will call the LLM to plan the steps and execute them. You can see the report file to see the process. It's a very common way for AI agents to these kinds of tasks.

![](/blog/report-planning.png)

In the meantime, there are many testing engineers who want a faster way to perform actions. When using AI models with complex prompts, some of the LLM models may find it hard to plan the proper steps, or the coordinates of the elements may not be accurate. It could be frustrating for debugging the unpredictable process.

To solve this problem, we have introduced the `aiTap()`, `aiHover()`, `aiInput()`, `aiKeyboardPress()`, `aiScroll()` interfaces. They are call the **"instant actions"**. These interfaces will directly perform the specified action as the interface name suggests, while the AI model is responsible for the easier tasks such as locating elements. The whole process can be obviously faster and more reliable after using them.

For example, the search action above can be rewritten as:

```typescript
await agent.aiInput('Headphones', 'search-box');
await agent.aiKeyboardPress('Enter');
```

The typical workflow in the report file is like this, as you can see there is no planning process in the report file:

![](/blog/report-instant-action.png)

The scripts with instant actions seems a little bit redundant (or not 'ai-style'), but we believe these structured interfaces are a good way to save time debugging when the action is already clear.

## Deep Think - A More Accurate Way to Locate Elements

When using Midscene with some complex widgets, the LLM may find it hard to locate the target element. We have introduced a new option named `deepThink` to the instant actions.

The signature of the instant actions with `deepThink` is like this:

```typescript
await agent.aiTap('target', { deepThink: true });
```

`deepThink` is a strategy of locating elements. It will first find an area that contains the target element, then "focus" on this area to search the element again. By this way, the coordinates of the target element will be more accurate. 

Let's take the workflow editor page of Coze.com as an example. There are many customized icons on the sidebar. This is usually hard for LLMs to distinguish the target element from its surroundings.

![](/blog/coze-sidebar.png)

After using `deepThink` in instant actions, the yaml scripts will be like this (of course, you can also use the javascript interface):

```yaml
tasks:
  - name: edit input panel
    flow:
      - aiTap: the triangle icon on the left side of the text "Input"
        deepThink: true
      - aiTap: the first checkbox in the Input form
        deepThink: true
      - aiTap: the expand button on the second row of the Input form (on the right of the checkbox)
        deepThink: true
      - aiTap: the delete button on the second last row of the Input form
        deepThink: true
      - aiTap: the add button on the last row of the Input form （second button from the right）
        deepThink: true
```

By viewing the report file, you can see Midscene has found every target element in the area.

![](/blog/report-coze-deep-think.png)

Just like the example above, the highly-detailed prompt for `deepThink` adheres to [the prompting tips](./prompting-tips). This is always the key to make result stable.

`deepThink` is only available with the models that support visual grounding like qwen2.5-vl. If you are using LLM models like gpt-4o, it won't work.
