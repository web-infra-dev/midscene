# Use Structured API to Optimize Automation Code

Many developers using `aiAction` will fall into a misconception: trying to describe all complex logic in a single natural language instruction. Although it looks "smart", in practice, it will bring a series of problems.

The most common mistake is writing a large logic storm with long descriptions, such as:

```javascript
aiAction(`
1. click the first user
2. click the chat bubble on the right side of the user page
3. if I have already sent a message to him/her, go back to the previous page
4. if I have not sent a message to him/her, input a greeting text and click send
`)
```

```javascript
await agent.aiAction('get all prices on the product list page, then go to the shopping cart page, and select the product with the lowest price')
```

This kind of writing will gather all operation instructions into a single Prompt, which actually has very high requirements for the understanding and stability of the AI model. Any step failure may cause the whole process to fail. Developers may also be lost in the circle of Prompt tuning.

Another misconception is to split the code into multiple `aiAction` methods, while the multiple `aiAction` methods still have context relationships, but `aiAction` cannot pass context to the next `aiAction`, so the same problem will occur.

```javascript
aiAction('click the first user')
aiAction('click the chat bubble on the right side of the user page')
aiAction('if I have already sent a message to him/her, go back to the previous page')
aiAction('if I have not sent a message to him/her, input a greeting text and click send')
```

## Use Structured API to Optimize Code

Midscene provides `aiBoolean` `aiString` `aiNumber` and other data extraction methods, which can be used to split complex logic into multiple steps to improve the stability of the automation code.

For the above examples, you can convert the natural language into this code form:

```javascript
aiAction('click the first user')
aiAction('click the chat bubble on the right side of the user page')

const hasAlreadyChat = await agent.aiBoolean('check if I have already sent a message to him/her')

if (hasAlreadyChat) {
  aiAction('go back to the previous page')
} else {
  aiAction('input a greeting text and click send')
}
```

Use this way to write automation code, can reduce the dependency on AI model, and improve the stability of the code.

Another example:

```javascript
aiAction(`
1. click the first user, enter the user's homepage
2. click the follow button
3. go back to the previous page
4. if all users are followed, scroll down one screen
5. repeat the above steps until all users are followed
`)


can be converted to:

```javascript
let user = await agent.aiQuery('string[], the user names in the list')
let currentUserIndex = 0

while (true) {
  await agent.aiAction(`click the first user, enter the user's homepage`)
  await agent.aiTap('follow button')
  await agent.aiAction('go back to the previous page')

  if (currentUserIndex === user.length - 1) {
    await agent.aiAction('scroll down one screen')
    user = await agent.aiQuery('string[], the user names in the list')
    currentUserIndex = 0
  } else {
    currentUserIndex++
  }
}
```

## Common Structured API Methods

### `aiBoolean` - Conditional Decision

* Use Case: Condition Judgment, State Detection
* Advantage: Convert fuzzy descriptions into clear boolean values

Example:
```javascript
const hasAlreadyChat = await agent.aiBoolean('check if I have already sent a message to him/her')
if (hasAlreadyChat) {
  // ...
}
```

### `aiString` - Text Extraction

* Use Case: Text Content Retrieval
* Advantage: Avoid Ambiguity in Natural Language Descriptions

Example:
```javascript
const username = await agent.aiString('the nickname of the first user in the list')
console.log('username is', username)
```

### `aiNumber` - Numerical Extraction

* Use Case: Counting, Numerical Comparison, Loop Control
* Advantage: Ensure Return Standard Numeric Types

Example:
```javascript
const unreadCount = await agent.aiNumber('the number of unread messages on the message icon')
for (let i = 0; i < unreadCount; i++) {
  // ...
}
```
