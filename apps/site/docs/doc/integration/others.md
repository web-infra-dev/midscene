# Any Source of UI

MidScene primarily sends screenshots and text to the AI, with DOM information being irrelevant. Therefore, you can use MidScene from any source for any type of UI, as long as the AI model can understand it.

Prepare the following info for composing:
* a screenshot in Base64
* the size of the screenshot
* all the texts along with their coordinates

For example 

```typescript
import Insight from 'midscene';

const insight = new Insight({     
  screenshotBase64: 'data:image...',
  size: {width: 1920, height: 1080},
  timestamp: Date.now(),
  allTexts: [ 
    {
      content: 'ABCDE',
      rect: {
        width: 100,
        height: 100,
        top: 200,
        left: 200,
      },
      center: [250, 250],
    },
    // ....
  ],
 });
```
