# Use JavaScript to Optimize the AI Automation Code

Many developers love using `ai` or `aiAction` to accomplish complex tasks, and even describe all logic in a single natural language instruction. Although it may seem 'intelligent', in practice, this approach may not provide a reliable and efficient experience, and results in an endless loop of Prompt tuning.

Here is a typical example, developers may write a large logic storm with long descriptions, such as:

```javascript
// complex tasks
aiAction(`
1. click the first user
2. click the chat bubble on the right side of the user page
3. if I have already sent a message to him/her, go back to the previous page
4. if I have not sent a message to him/her, input a greeting text and click send
`)
```

Another common misconception is that the complex workflow can be effectively controlled using `aiAction` methods. These prompts are far from reliable when compared to traditional JavaScript. For example:

```javascript
// not stable !
aiAction('click all the records one by one. If one record contains the text "completed", skip it')
```

## Use JavaScript and Structured API to Write Automation Scripts

From v0.16.10, Midscene provides data extraction methods like `aiBoolean` `aiString` `aiNumber`, which can be used to control the workflow. 

Combining them with the instant action methods, like `aiTap`, `aiInput`, `aiScroll`, `aiHover`, etc., you can split complex logic into multiple steps to improve the stability of the automation code.

Let's take the first bad case above, you can convert the `.aiAction` method into a structured API call:

Original prompt:

```
click all the records one by one. If one record contains the text "completed", skip it
```

Converted code:
```javascript
const recordList = await agent.aiQuery('string[], the record list')
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record contains the text "completed"`)
  if (!hasCompleted) {
    await agent.aiTap(record)
  }
}
```

After modifying the coding style, the whole process can be much more reliable and easier to maintain.

## A More Complex Example

Here is another example, this is what it looks like before rewriting: 

```javascript
aiAction(`
1. click the first unfollowed user, enter the user's homepage
2. click the follow button
3. go back to the previous page
4. if all users are followed, scroll down one screen
5. repeat the above steps until all users are followed
`)
```

After using the structured APIs, developers can easily inspect the code step by step.

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
    await agent.aiScroll('scroll down one screen')
    
    // Get the updated user list
    user = await agent.aiQuery('string[], the unfollowed user names in the list')
    currentUserIndex = 0
  }
}
```

## Commonly-used Structured API Methods

Here are some commonly-used structured API methods:

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

### `aiQuery` - General Data Extraction

* Use Case: Extract any data type
* Advantage: Flexible Data Type Handling

Example:
```javascript
const userList = await agent.aiQuery('string[], the user list')
```

### Instant Action Methods

Midscene provides some instant action methods, like `aiTap`, `aiInput`, `aiScroll`, `aiHover`, etc., They are also commonly used in the automation code. You can check them in the [API](./API) page.

## Want to Write Structured Code Easily ?

If you think the javascript code is hard to write, then this is the right time to use the AI IDE.

Use your AI IDE to index the following documents:

- https://midscenejs.com/blog-programming-practice-using-structured-api.md
- https://midscenejs.com/API.md

And use this prompt:

```
According to the tips and APIs mentioned in Midscene documents, please help me convert the following instructions into structured javascript code:

<your prompt>
```

And the magic would happen.
Enjoy it!


## What's Next ?

To achieve better performance, you can check the [Midscene caching feature](./caching) to cache the planning and xpath results.

To learn more about the structured API, you can check the [API reference](./API).


