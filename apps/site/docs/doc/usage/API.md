# API

A typical process to understand a UI is like:
* Build an `Insight` instance
* Locate something
  * Use `insight.find` to locate an easily identifiable element
  * Use `insight.segment` to find an area consisting of multiple elements (i.e. a section).
  * By passing a `query`, both `find` and `segment` can be used to extract data from the user interface. For example, extract a username from an input element or extract well-structured table data from a section.
* Make an interaction or an assertion

## Create an `Insight` instance

`Insight` is the most commonly used class. It contains the contextual information of a page, and the subsequent queries will heavily rely on this context.

### Build an `Insight` from puppeteer

Here is a sample:

```typescript
import Insight, { query } from 'midscene';
import puppeteer from 'puppeteer';

// launch the browser and page
const browser = await puppeteer.launch();
const page = (await browser.pages())[0];
await page.setViewport({ width: 1920, height: 1080 })
await page.goto('https://code.visualstudio.com/');

// build the insight
const insight = await Insight.fromPuppeteerBrowser(browser);
```

⁠Under the hood, MidScene injects scripts into the webpage to extract all texts and build context. Currently, text within `<img />` or `<canvas />` elements will not be included.

### Build an `Insight` from playwright

The API is pretty like the previous one.

```typescript
import Insight from 'midscene';

test.describe('New Todo', () => {
  test('...', async ({ page }) => {
    const insight = await Insight.fromPlaywrightPage(page);
    // continue your code here
 });
});
```

### Build with your own Context, no matter what the source is

See [Integration / Others](/doc/integration/others)


## find element(s)

"Element" is the smallest unit in MidScene. Each element has its own content and bounding rectangle. 

`find` is used to locate or extract some data from specific elements. The return value includes the element information (content, coordinates, etc) and the expected data.

Usually you need to find an `element` to interact with the page.

### find one or more elements on a page

Use `await find(queryPrompt, opt?: {multi: boolean})` to find one or more basic elements. For example:
```typescript
// find one text element
const result = await insight.find('the biggest Download button');

// find all the buttons on nav bar
const result = await insight.find('the nav bar buttons', {multi: true});
```

### extract data from element(s)

Pass `query(queryPrompt, dataShape)` as `queryPrompt`, you can extract customized data from the UI as long as multi-modal AI can perform inference.

```typescript
// find one text element
const result = await insight.find(query('the biggest Download button', {{
  textColor: 'string, color of text, one of blue / red / yellow / green / white / black / others',
  backgroundColor: 'string, color of background, one of blue / red / yellow / green / white / black / others',
}}));

/*
it will return data like this:
{
  content: 'Download Mac Universal',
  rect: { ... },
  textColor: 'white',
  backgroundColor: 'blue'
}
*/
```

:::tip
In the current version of MidScene, all returned elements are `TextElement`(i.e. element containing texts). Image Elements are not supported yet.
:::

## `segment` to match section

A section is an area that consists of multiple relevant elements. The boundaries of the section are determined by the bounding boxes of all child elements. 

Use `segment` to locate one or more sections. You can also extract data or retrieve `element`s inside a section.

### free segmentation

Calling `await insight.segment()` without parameters will let AI segment the page into different sections. Since no prompt is provided, the results may be unreliable and can vary with each run.

```typescript
const result = await insight.segment();
```

### segment into specific section(s)

Use `segment({[name]: queryPrompt})` to match one or more sections. In the return value, the `name` key will have the same index as the corresponding section.

```typescript
const result = await insight.segment({
  'data-record': 'Data Record title and table',
});

console.log(result['data-record']);
```

### segment specific section(s) and extract custom data

Use `segment({[name]: query(queryPrompt, dataShape)})` to match one or more sections, and extract custom data from the UI.

* `queryPrompt` is the basic description of a section
* `dataShape` (optional) describes the custom data you want to extract from the UI in a key-value style
  * keys in `dataShape` specifies the name you want in the return value
  * value describes the data format you want to get from result. You can describe the data format with natural language.
  * use `retrieveOneElement(prompt: string)` / `retrieveElements(prompt: string)` to get original element(s) in return value. These two methods can only be used in the first level of `dataShape`.
  * Like basic query, `dataShape` will be part of a prompt sent to the AI model. Tricks that can be used to optimize the return value also apply here.

Here is an example to parse different kind of data:

```typescript
const result = await insight.segment({
  'data-record': query('Data Record title and table', {
    time: 'date and time, string',
    userInfo: 'user info, {name: string}',
    userInfoElement: retrieveOneElement('element indicates the username'),
    tableFields: 'field names of table, string[]',
    tableDataRecord: 'data record of table, {id: string, [fieldName]: string}[]',
  }),
});

console.log(result['data-record']);

/*
{
  time: '1970-01-01 19:25:01',
  userInfo: { name: 'Stella' },
  userInfoElement: <Element { content: 'User Name: Stella', rect: [Object] } >,
  tableFields: [ 'ID', 'Field 2', 'Field 3', 'Field 4', 'Field 5' ],
  tableDataRecord: [   {
    "Field 2": "Row 1, Col 2",
    "Field 3": "Row 1, Col 3",
    "Field 4": "Row 1, Col 4",
    "Field 5": "Row 1, Col 5",
    "id": "a1",
  }, ... ]
  // ...other basic fields
}
*/
```

The default expanded structure of the return value is `Record<[user-expected-name: string]: any>`

To make this value clearer (i.e. replace `any` with a specific type), you can use the generic parameter of `query`. Here is an example.

```typescript
interface RichUI {
  time: string;
  userInfo: { name: string };
}

// the `result` here is fully typed
const result = await insight.segment({
  'data-record': query<RichUI>('Data Record title and table', {
    time: 'date and time, string',
    userInfo: 'user info, {name: string}',
  }),
});
```

## query

```typescript
import { query } from 'midscene';
```

`query` is the way you write the constraints and data requirements. Both `find` and `segment` accept a `query` parameter.

The `query` parameters will be sent to the AI system as part of a prompt. It's typically composed by two parts:
* Constraints: the description of your target, such as its location, its characteristics, and how to identify it...
* Data Shape(data prompt): the specific data you want to extract from the user interface. The structure of the data is flexible. Just ensure that it is described clearly. After understanding the user interface, the AI will infer the values for you.

Here is a sample: 
```typescript
query('download buttons on the page', {
  textsOnButton: 'string',
  backgroundColor: 'string, color of text, one of blue / red / yellow / green / white / black / others',
})
```

A more complicated sample to retrieve element and expecting table data:
```typescript
query<RichUI>(
  'Data Record title and table',
  {
    time: 'date and time, string',
    userInfo: 'user info, {name: string}',
    userInfoElement: retrieveOneElement('element indicates the username'),
    tableFields: 'field names of table, string[]',
    tableDataRecord: 'data record of table, {id: string, [fieldName]: string}[]',
  },
)
```

On the other hand, if you do not need to extract any data from the UI, you can use a plain string as a shortcut instead of a query.

```typescript
const result1 = await insight.find('the biggest Download button');

const result2 = await insight.segment({
  'data-record': 'Data Record title and table',
});
```

## Difference between `find` and `retrieveOneElement` with `segment`

Both of them can be used to retrieve an element.

⁠If you want to find a globally unique and easily identifiable element, `find` may be suitable.

If you want to narrow down the search range, use `retrieveOneElement` or `retrieveElements` with `segment` to get more precise results.


## Preparation for OpenAI

Configure an OpenAI key that is eligible for accessing GPT-4o:

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"

# optional, if you use a proxy
# export OPENAI_BASE_URL="..."
```

If you want to use some customized option to initialize OpenAI:

```bash
export MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"....","defaultHeaders":{"key": "value"}}'
export MIDSCENE_OPENAI_MODEL='gpt-4o';
```

## Use LangSmith to Debug

To integrate LangSmith, please follow these steps:

```shell
# install langsmith dependency
npm i langsmith

# set env variables

# Flag to enable debug
export MIDSCENE_LANGSMITH_DEBUG=1 

# LangSmith config
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
export LANGCHAIN_API_KEY="your_key_here"
export LANGCHAIN_PROJECT="your_project_name_here"
```

Launch MidScene, you should see logs like this:

```log
DEBUGGING MODE: using langsmith wrapper
```
