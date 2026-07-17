/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/visualizer', () => ({
  ShinyText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('antd', () => ({
  Progress: () => null,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => (
      <span>{children}</span>
    ),
  },
}));

describe('ProgressModal StepList', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('connects adjacent step icons across cards with different heights', async () => {
    const { StepList } = await import(
      '../src/extension/recorder/components/ProgressModal/StepList'
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const steps = [
      {
        id: 'descriptions',
        title: 'Generate Element Descriptions',
        description: 'Analyzing UI elements and generating descriptions',
        details: 'Generated descriptions for 6 elements',
        status: 'completed' as const,
      },
      {
        id: 'title',
        title: 'Generate Title & Description',
        description: 'Creating a title using AI',
        details: 'Analyzing session content...',
        status: 'loading' as const,
      },
    ];

    await act(async () => {
      root.render(
        <StepList
          steps={steps}
          completedSteps={new Set()}
          slidingOutSteps={new Set()}
          getStepIcon={(step) => <span>{step.id}</span>}
          getStepColor={() => '#1890ff'}
        />,
      );
    });

    const connectors = Array.from(
      container.querySelectorAll<HTMLElement>('[data-progress-connector]'),
    );
    expect(connectors).toHaveLength(2);
    expect(
      connectors.map((connector) => connector.dataset.progressConnector),
    ).toEqual(['after', 'before']);
    expect(connectors[0].style.top).toBe('50%');
    expect(connectors[1].style.bottom).toBe('50%');

    await act(async () => {
      root.unmount();
    });
  });
});
