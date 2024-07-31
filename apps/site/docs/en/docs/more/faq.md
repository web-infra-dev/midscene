# FAQ

### Can MidScene smartly plan the actions according to my one-line goal? Like executing "Tweet 'hello world'"

MidScene is an automation assistance SDK with a key feature of action stability — ensuring the same actions are performed in each run. To maintain this stability, we encourage you to provide detailed instructions to help the AI understand each step of your task.

If you require a 'goal-to-task' AI planning tool, you can develop one based on MidScene.

Related Docs:
* [Tips for Prompting](./prompting-tips.html)

### Limitations

There are some limitations with MidScene. We are still working on them.

1. The interaction types are limited to only tap, type, keyboard press, and scroll.
2. It's not 100% stable. Even GPT-4o can't return the right answer all the time. Following the [Prompting Tips](./prompting-tips) will help improve stability.
3. Since we use JavaScript to retrieve items from the page, the elements inside the iframe cannot be accessed.

### Which LLM should I choose ?

MidScene needs a multimodal Large Language Model (LLM) to understand the UI. Currently, we find that OpenAI's  GPT-4o performs much better than others.

### About the token cost

Image resolution and element numbers (i.e., a UI context size created by MidScene) form the token bill.

Here are some typical data.

|Task | Resolution | Input tokens | Output tokens | GPT-4o Price |
|-----|------------|--------------|---------------|----------------|
|Find the download button on the VSCode website| 1920x1080| 2011|54| $0.011|
|Split the Github status page| 1920x1080| 3609|1020| $0.034|

> The price data was calculated in June 2024.

### The automation process is running more slowly than it did before

Since MidScene.js invokes AI for each planning and querying operation, the running time may increase by a factor of 3 to 10 compared to traditional Playwright scripts, for instance from 5 seconds to 20 seconds. This is currently inevitable but may improve with advancements in LLMs.

Despite the increased time and cost, MidScene stands out in practical applications due to its unique development experience and easy-to-maintain codebase. We are confident that incorporating automation scripts powered by MidScene will significantly enhance your project’s efficiency, cover many more situations, and boost overall productivity.

In short, it is worth the time and cost.
