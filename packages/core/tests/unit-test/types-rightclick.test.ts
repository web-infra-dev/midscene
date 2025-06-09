import { describe, expect, it } from 'vitest';
import type {
  MidsceneYamlFlowItemAIRightClick,
  PlanningAction,
  PlanningActionParamRightClick,
} from '../../src/index';

describe('RightClick Types', () => {
  it('should allow RightClick in PlanningAction type', () => {
    const rightClickAction: PlanningAction<PlanningActionParamRightClick> = {
      type: 'RightClick',
      param: null,
      thought: 'Right click to open context menu',
      locate: {
        prompt: 'element to right click',
        id: 'test-element',
      },
    };

    expect(rightClickAction.type).toBe('RightClick');
    expect(rightClickAction.param).toBeNull();
    expect(rightClickAction.thought).toBe('Right click to open context menu');
    expect(rightClickAction.locate?.prompt).toBe('element to right click');
  });

  it('should allow RightClick in YAML flow item type', () => {
    const yamlFlowItem: MidsceneYamlFlowItemAIRightClick = {
      aiRightClick: 'button to right click',
      deepThink: true,
      cacheable: false,
    };

    expect(yamlFlowItem.aiRightClick).toBe('button to right click');
    expect(yamlFlowItem.deepThink).toBe(true);
    expect(yamlFlowItem.cacheable).toBe(false);
  });

  it('should support minimal YAML flow item for RightClick', () => {
    const minimalFlowItem: MidsceneYamlFlowItemAIRightClick = {
      aiRightClick: 'simple right click target',
    };

    expect(minimalFlowItem.aiRightClick).toBe('simple right click target');
    expect(minimalFlowItem.deepThink).toBeUndefined();
    expect(minimalFlowItem.cacheable).toBeUndefined();
  });

  it('should verify PlanningActionParamRightClick is null', () => {
    const param: PlanningActionParamRightClick = null;
    expect(param).toBeNull();
  });
});
