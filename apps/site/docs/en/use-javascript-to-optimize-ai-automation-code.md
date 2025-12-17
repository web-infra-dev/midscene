# Use JavaScript to optimize the AI automation code

Many developers love using `aiAct` or `ai` to accomplish automation tasks, even packing long, complex logic into a single natural-language instruction. It feels “smart,” but in practice you may run into unstable reproducibility and slower performance.

This article shares an approach for writing automation scripts with JavaScript and structured APIs.

## Write automation scripts with JavaScript and structured APIs

Midscene provides structured API methods like `aiBoolean`, `aiString`, and `aiNumber` to extract state from the UI. Combined with instant action methods like `aiTap`, `aiInput`, `aiScroll`, and `aiHover`, you can break complex logic into steps to make automation more stable.

### A simple example

Take this prompt as an example:

```txt
click all the records one by one. If one record contains the text "completed", skip it
```

By composing the structured APIs, you can convert the prompt into more reliable, maintainable code:
```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record}" contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

After changing the coding style, the process becomes more reliable and easier to maintain, and you can use traditional debugging to control the execution flow.

### A complex example

Here is another example, shown before rewriting:

```javascript
aiAct(`
1. click the first unfollowed user, enter the user's homepage
2. click the follow button
3. go back to the previous page
4. if all users are followed, scroll down one screen
5. repeat the above steps until all users are followed
`)
```

Using structured APIs, you can lock this flow into code:

```javascript
let user = await agent.aiQuery('string[], the unfollowed user names in the list')
let currentUserIndex = 0

while (user.length > 0) {
  console.log('current user is', user[currentUserIndex])
  await agent.aiTap(user[currentUserIndex])
  try {
    await agent.aiTap('follow button')
  } catch (e) {
    // ignore if error
  }
  // Go back to the previous page
  await agent.aiTap('back button')
  
  currentUserIndex++
  
  // Check if we've gone through all users in the current list
  if (currentUserIndex >= user.length) {
    // Scroll down to load more users
    await agent.aiScroll({
      direction: 'down',
      scrollType: 'once',
    })
    
    // Get the updated user list
    user = await agent.aiQuery('string[], the unfollowed user names in the list')
    currentUserIndex = 0
  }
}
```

## Commonly-used structured API methods

Here are some commonly-used structured API methods:

### `aiBoolean` - conditional decision

* Use Case: Condition Judgment, State Detection
* Advantage: Convert fuzzy descriptions into clear boolean values

Example:
```javascript
const hasAlreadyChat = await agent.aiBoolean('check if I have already sent a message to him/her')
if (hasAlreadyChat) {
  // ...
}
```

### `aiString` - text extraction

* Use Case: Text Content Retrieval
* Advantage: Avoid Ambiguity in Natural Language Descriptions

Example:
```javascript
const username = await agent.aiString('the nickname of the first user in the list')
console.log('username is', username)
```

### `aiNumber` - numerical extraction

* Use Case: Counting, Numerical Comparison, Loop Control
* Advantage: Ensure Return Standard Numeric Types

Example:
```javascript
const unreadCount = await agent.aiNumber('the number of unread messages on the message icon')
for (let i = 0; i < unreadCount; i++) {
  // ...
}
```

### `aiQuery` - general data extraction

* Use Case: Extract any data type
* Advantage: Flexible Data Type Handling

Example:
```javascript
const userList = await agent.aiQuery('string[], the user list')
```

### Instant action methods

Midscene provides some instant action methods, like `aiTap`, `aiInput`, `aiScroll`, `aiHover`, etc., They are also commonly used in the automation code. You can check them in the [API](./api.mdx) page.

## Which approach is best: `aiAct` or structured code?

There is no standard answer. It depends on the model's ability, the complexity of the actual business.

Generally, if you encounter the following situations, you should consider abandoning the `aiAct` method:

- The success rate of `aiAct` does not meet the requirements after multiple retries
- You have already felt tired and spent too much time repeatedly tuning the `aiAct` prompt
- You need to debug the script step by step

## Want to write structured code easily?

If you think the JavaScript code above is hard to write, now is the time to use an AI IDE.

Use your AI IDE to index our docs:

- https://midscenejs.com/use-javascript-to-optimize-ai-automation-code.md
- https://midscenejs.com/api.md

To learn how to add Midscene docs to your AI IDE, see [this article](./llm-txt.mdx#usage).
