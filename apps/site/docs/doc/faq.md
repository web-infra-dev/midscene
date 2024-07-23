# Q & A

#### About the token cost

Image resolution and element numbers (i.e., a UI context size created by MidScene) form the token bill.

Here are some typical data.

|Task | Resolution | Input tokens | Output tokens | GPT-4o Price |
|-----|------------|--------------|---------------|----------------|
|Find the download button on the VSCode website| 1920x1080| 2011|54| $0.011|
|Split the Github status page| 1920x1080| 3609|1020| $0.034|

The above price data was calculated in June 2024.

#### How can I do assertions with MidScene ?

MidScene.js is an SDK for UI understanding, rather than a testing framework. You should integrate it with a familiar testing framework.

Here are some feasible ways:
* Using Playwright, see [Integrate with Playwright](/doc/integration/playwright)
* Using [Vitest](https://vitest.dev/) + [puppeteer](https://pptr.dev/), see [Integrate with Puppeteer](/doc/integration/puppeteer)


#### What's the "element" in MidScene ? 

An element in MidScene is an object defined by MidScene. Currently, it contains only text elements, primarily consisting of text content and coordinates. It is different from elements in the browser, so you cannot call browser methods on it.

#### Failed to interact with web page ?

The coordinates returned from MidScene only represent their positions at the time they are collected. You should check the latest UI style when interacting with the UI.
