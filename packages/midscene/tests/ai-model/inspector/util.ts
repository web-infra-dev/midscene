import path from 'path';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { base64Encoded, imageInfoOfBase64 } from '@/image';
import { describeUserPage } from '@/ai-model';

type TestCase = {
    description: string;
    multi: boolean
};


export interface AiElementsResponse {
    "elements": Array<{
        "id": string,
        "reason": string,
        "text": string,
    }>
}

export interface TextAiElementResponse extends AiElementsResponse {
    // for test
    "caseIndex"?: number;
    "prompt": string;
    "error"?: string,
    "spendTime": string,
}

export async function runTestCases(
    testCases: Array<TestCase>, 
    getAiResponse: (options: {
        description: string;
        multi: boolean;
    }) => (Promise<AiElementsResponse>)
) {
    let aiResponse: Array<TextAiElementResponse> = [];

    const aiReq = testCases.map(async (testCase, caseIndex)=>{
        const startTime = Date.now();
        const msg = await getAiResponse(testCase);
        const endTime = Date.now();
        const spendTime = (endTime - startTime)/1000;
        if (msg.elements) {
            aiResponse.push({
                ...msg,
                prompt: testCase.description,
                caseIndex,
                spendTime: `${spendTime}s`
            });
        } else {
            aiResponse.push({
                error: `can't find element with description: ${testCase.description}`
            } as any);
        }
    });
    await Promise.all(aiReq);
    aiResponse = aiResponse.sort((a,b)=> {
        if (a.caseIndex !== undefined && b.caseIndex !== undefined) {
            return a.caseIndex - b.caseIndex;
        } else {
            return -1;
        }
    });

    aiResponse.forEach((item)=>{
        if ('caseIndex' in item) {
            delete item.caseIndex
        }
    });

    const filterUnStableinf = aiResponse.map((aiInfo)=>{
        const { elements = [] , prompt, error = []} = aiInfo;
        return {
            elements: elements.map((element)=> {
                return {
                    id: element.id.toString(),
                };
            }),
            prompt,
            error,
        }
    });

    return {
        aiResponse,
        filterUnStableinf
    };
}



export const repeat = (times: number, fn: (index: number) => void) => {
    for (let i = 1; i <= times; i++) {
      fn(i);
    }
};


function ensureDirectoryExistence(filePath: string) {
    const dirname = path.dirname(filePath);
    if (existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    mkdirSync(dirname);
}

type WriteFileSyncParams = Parameters<typeof writeFileSync>;

export function writeFileSyncWithDir(filePath: string, content: WriteFileSyncParams[1], options: WriteFileSyncParams[2] = {}) {
    ensureDirectoryExistence(filePath);
    writeFileSync(filePath, content, options);
}

export async function getPageTestData(targetDir: string){
    const resizeOutputImgP = path.join(targetDir, 'input.png');
    const snapshotJsonPath = path.join(targetDir, 'element-snapshot.json');
    const snapshotJson = readFileSync(snapshotJsonPath, { encoding: 'utf-8'});
    const screenshotBase64 = base64Encoded(resizeOutputImgP);
    const size = await imageInfoOfBase64(screenshotBase64);
    const baseContext = {
        size,
        content: JSON.parse(snapshotJson),
        screenshotBase64: base64Encoded(resizeOutputImgP),
    };

    return {
        context: {
            ...baseContext,
            describer: async () => {
                return describeUserPage(baseContext);
            },
        },
        snapshotJson,
        screenshotBase64: base64Encoded(resizeOutputImgP)
    };
}

