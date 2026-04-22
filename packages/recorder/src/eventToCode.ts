import type { RecordedEvent } from './recorder';

export interface StepAction {
    method: string;
    locate?: string;
    options?: Record<string, any>;
    url?: string;
    viewportSize?: {
        width: number;
        height: number;
    };
}

export interface StepCode {
    stepNumber: number;
    action: StepAction;
    eventType: string;
    timestamp: number;
    elementDescription?: string;
    pageInfo?: {
        width: number;
        height: number;
    };
}

export class StepCodeGenerator {
    private stepCodes: StepCode[] = [];
    private stepCounter = 0;
    private previousEvents: Map<string, RecordedEvent[]> = new Map();

    clear(): void {
        this.stepCodes = [];
        this.stepCounter = 0;
        this.previousEvents.clear();
    }

    getStepCodes(): StepCode[] {
        return [...this.stepCodes];
    }

    getFullJSON(): string {
        if (this.stepCodes.length === 0) {
            return JSON.stringify({ steps: [] }, null, 2);
        }
        return JSON.stringify({ steps: this.stepCodes }, null, 2);
    }

    private getPreviousEvents(eventType: string): RecordedEvent[] {
        return this.previousEvents.get(eventType) || [];
    }

    private setPreviousEvents(eventType: string, events: RecordedEvent[]): void {
        this.previousEvents.set(eventType, events);
    }

    generateStepCode(event: RecordedEvent): StepCode | null {
        this.stepCounter++;
        const stepNumber = this.stepCounter;

        let action: StepAction | null = null;

        switch (event.type) {
            case 'click':
                action = this.generateClickAction(event);
                break;
            case 'input':
                action = this.generateInputAction(event);
                break;
            case 'scroll':
                action = this.generateScrollAction(event);
                break;
            case 'navigation':
                action = this.generateNavigationAction(event);
                break;
            case 'keydown':
                action = this.generateKeydownAction(event);
                break;
            case 'setViewport':
                action = this.generateSetViewportAction(event);
                break;
            default:
                console.warn(`[StepCodeGenerator] Unknown event type: ${event.type}`);
                return null;
        }

        if (!action) {
            return null;
        }

        const stepCode: StepCode = {
            stepNumber,
            action,
            eventType: event.type,
            timestamp: event.timestamp,
            elementDescription: event.elementDescription,
            pageInfo: event.pageInfo,
        };

        this.stepCodes.push(stepCode);
        return stepCode;
    }

    private generateClickAction(event: RecordedEvent): StepAction {
        const options: Record<string, any> = {
            deepLocate: true,
            cacheable: true,
        };

        if (event.isLabelClick && event.labelInfo) {
            options.fileChooserAccept = this.determineFileChooserAccept(event);
        }

        return {
            method: 'aiTap',
            locate: event.elementDescription || 'element',
            options,
        };
    }

    private generateInputAction(event: RecordedEvent): StepAction {
        const previousInputs = this.getPreviousEvents('input');
        const isSequentialInput = previousInputs.length > 0 &&
            previousInputs[previousInputs.length - 1].element === event.element;

        const mode = this.determineInputMode(event, isSequentialInput);

        return {
            method: 'aiInput',
            locate: event.elementDescription || 'input field',
            options: {
                mode,
                deepLocate: true,
                cacheable: true,
            },
        };
    }

    private generateScrollAction(event: RecordedEvent): StepAction {
        const previousScrolls = this.getPreviousEvents('scroll');
        const scrollDirection = this.determineScrollDirection(event, previousScrolls);

        return {
            method: 'aiScroll',
            locate: event.elementDescription || 'scrollable area',
            options: {
                direction: scrollDirection,
                deepLocate: true,
                cacheable: true,
            },
        };
    }

    private generateNavigationAction(event: RecordedEvent): StepAction {
        return {
            method: 'aiAssert',
            locate: event.url || 'current page',
            options: {
                url: event.url,
                deepLocate: false,
                cacheable: true,
            },
        };
    }

    private generateKeydownAction(event: RecordedEvent): StepAction {
        return {
            method: 'aiType',
            locate: event.elementDescription || 'active element',
            options: {
                key: event.value,
                deepLocate: true,
                cacheable: true,
            },
        };
    }

    private generateSetViewportAction(event: RecordedEvent): StepAction {
        return {
            method: 'aiViewport',
            viewportSize: event.pageInfo,
            options: {
                deepLocate: false,
                cacheable: true,
            },
        };
    }

    private determineFileChooserAccept(event: RecordedEvent): string {
        if (event.element && event.element instanceof HTMLElement) {
            const fileInput = event.element.querySelector('input[type="file"]');
            if (fileInput) {
                const accept = fileInput.getAttribute('accept');
                if (accept) {
                    return accept;
                }
            }
        }
        return '*/*';
    }

    private determineInputMode(event: RecordedEvent, isSequentialInput: boolean): string {
        if (event.inputType === 'file') {
            return 'file';
        }
        if (event.inputType === 'password') {
            return 'password';
        }
        if (isSequentialInput) {
            return 'append';
        }
        return 'fill';
    }

    private determineScrollDirection(event: RecordedEvent, previousScrolls: RecordedEvent[]): string {
        if (previousScrolls.length === 0) {
            return 'down';
        }

        const lastScroll = previousScrolls[previousScrolls.length - 1];
        if (event.elementRect && lastScroll.elementRect) {
            const currentTop = event.elementRect.top ?? 0;
            const lastTop = lastScroll.elementRect.top ?? 0;
            const deltaY = currentTop - lastTop;
            return deltaY > 0 ? 'down' : 'up';
        }

        return 'down';
    }
}

// Global singleton instance for cross-platform compatibility
let globalStepCodeGenerator: StepCodeGenerator | null = null;

export const getStepCodeGenerator = (): StepCodeGenerator => {
    if (!globalStepCodeGenerator) {
        globalStepCodeGenerator = new StepCodeGenerator();
    }
    return globalStepCodeGenerator;
};

export const resetStepCodeGenerator = (): void => {
    if (globalStepCodeGenerator) {
        globalStepCodeGenerator.clear();
    }
};

export const logStepCodeToConsole = (stepCode: StepCode): void => {
    const timestamp = new Date(stepCode.timestamp).toLocaleTimeString();
    console.log(`\n[Step ${stepCode.stepNumber}] ${timestamp}`);
    console.log(`Event Type: ${stepCode.eventType}`);
    console.log(`Method: ${stepCode.action.method}`);
    if (stepCode.action.locate) {
        console.log(`Locate: ${stepCode.action.locate}`);
    }
    if (stepCode.action.options) {
        console.log(`Options:`, JSON.stringify(stepCode.action.options, null, 2));
    }
    if (stepCode.elementDescription) {
        console.log(`Element Description: ${stepCode.elementDescription}`);
    }
    console.log('---');
};

export const saveStepCodesToFile = (stepCodes: StepCode[], fileName?: string): void => {
    const fullJSON = JSON.stringify({ steps: stepCodes }, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const defaultFileName = fileName || `midscene-steps-${timestamp}.json`;

    const blob = new Blob([fullJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[StepCodeGenerator] Saved ${stepCodes.length} steps to ${defaultFileName}`);
};