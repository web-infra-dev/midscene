import { callAI } from '@/ai-model/service-caller';
import { localImg2Base64 } from '@/image';
import type { CodeGenerationChunk } from '@/types';
import { globalModelConfigManager } from '@midscene/shared/env';
import dotenv from 'dotenv';
import { getFixture } from 'tests/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';

dotenv.config({
  debug: true,
  override: true,
});

vi.setConfig({
  testTimeout: 30 * 1000, // Increased timeout for streaming tests
});

const defaultModelConfig = globalModelConfigManager.getModelConfig('default');

describe(
  'Streaming functionality',
  {
    timeout: 10 * 60 * 1000,
  },
  () => {
    it('should stream text response with proper chunk structure', async () => {
      const chunks: CodeGenerationChunk[] = [];
      let chunkCount = 0;
      let totalContent = '';

      const result = await callAI(
        [
          {
            role: 'system',
            content: 'You are a helpful assistant. Provide detailed answers.',
          },
          {
            role: 'user',
            content:
              'Explain the concept of artificial intelligence in 3-4 sentences.',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            chunks.push(chunk);
            chunkCount++;

            // Validate chunk structure
            expect(chunk).toHaveProperty('content');
            expect(chunk).toHaveProperty('accumulated');
            expect(chunk).toHaveProperty('isComplete');
            expect(chunk).toHaveProperty('reasoning_content');
            expect(chunk).toHaveProperty('usage');

            // Type validation
            expect(typeof chunk.content).toBe('string');
            expect(typeof chunk.accumulated).toBe('string');
            expect(typeof chunk.isComplete).toBe('boolean');
            expect(typeof chunk.reasoning_content).toBe('string');

            if (!chunk.isComplete) {
              totalContent += chunk.content;
              expect(chunk.accumulated).toBe(totalContent);
              expect(chunk.usage).toBeUndefined();
            }
          },
        },
      );

      expect(result.usage).toBeDefined();
      expect(result.usage!.total_tokens).toBeGreaterThan(0);
      expect(result.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage!.completion_tokens).toBeGreaterThan(0);
      expect(result.usage!.time_cost).toBeGreaterThan(0);
      // Verify streaming occurred
      expect(result.isStreamed).toBe(true);
      expect(chunkCount).toBeGreaterThan(1);
      expect(chunks.length).toBeGreaterThan(1);

      // Verify final result
      expect(result.content.length).toBeGreaterThan(20);
      expect(result.usage).toBeDefined();

      // Verify the final chunk matches the result
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.isComplete).toBe(true);
      expect(finalChunk.accumulated).toBe(result.content);
      expect(finalChunk.usage).toEqual(result.usage);
    });

    it('should handle streaming with image input', async () => {
      const chunks: CodeGenerationChunk[] = [];
      const imagePath = getFixture('baidu.png');

      const result = await callAI(
        [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe what you see in this image in detail.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: localImg2Base64(imagePath),
                  detail: 'high',
                },
              },
            ],
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            chunks.push(chunk);
          },
        },
      );

      expect(result.isStreamed).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      expect(result.content.length).toBeGreaterThan(10);

      // Verify incremental content accumulation
      let expectedAccumulated = '';
      for (const chunk of chunks) {
        if (!chunk.isComplete) {
          expectedAccumulated += chunk.content;
          expect(chunk.accumulated).toBe(expectedAccumulated);
        }
      }

      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.isComplete).toBe(true);
      expect(finalChunk.accumulated).toBe(result.content);
    });

    it('should preserve reasoning content in streaming chunks', async () => {
      const chunks: CodeGenerationChunk[] = [];
      let hasReasoningContent = false;

      const result = await callAI(
        [
          {
            role: 'system',
            content: 'Think step by step and explain your reasoning.',
          },
          {
            role: 'user',
            content: 'What is 15 multiplied by 8? Show your thinking process.',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            chunks.push(chunk);
            if (chunk.reasoning_content && chunk.reasoning_content.length > 0) {
              hasReasoningContent = true;
            }
          },
        },
      );

      expect(result.isStreamed).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);

      // Some models might include reasoning content
      for (const chunk of chunks) {
        expect(chunk.reasoning_content).toBeDefined();
        expect(typeof chunk.reasoning_content).toBe('string');
      }
    });

    it('should accumulate content correctly across all chunks', async () => {
      const chunks: CodeGenerationChunk[] = [];

      await callAI(
        [
          {
            role: 'user',
            content: 'Count from 1 to 10, with each number on a new line.',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            chunks.push(chunk);
          },
        },
      );

      // Verify content accumulation logic
      let manualAccumulation = '';
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (!chunk.isComplete) {
          manualAccumulation += chunk.content;
          expect(chunk.accumulated).toBe(manualAccumulation);
        } else {
          // Final chunk should have all content accumulated
          expect(chunk.accumulated.length).toBeGreaterThanOrEqual(
            manualAccumulation.length,
          );
        }
      }
    });

    it('should handle empty chunks gracefully', async () => {
      const chunks: CodeGenerationChunk[] = [];

      const result = await callAI(
        [
          {
            role: 'user',
            content: 'Say "Hi"',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            chunks.push(chunk);

            // Even empty chunks should have valid structure
            expect(chunk.content).toBeDefined();
            expect(chunk.accumulated).toBeDefined();
            expect(typeof chunk.isComplete).toBe('boolean');
          },
        },
      );

      expect(result.isStreamed).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);

      // Final result should still be valid
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should maintain proper timing information', async () => {
      const startTime = Date.now();
      let firstChunkTime: number | undefined;
      let lastChunkTime: number | undefined;

      const result = await callAI(
        [
          {
            role: 'user',
            content: 'Write a brief paragraph about the weather.',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          onChunk: (chunk: CodeGenerationChunk) => {
            const currentTime = Date.now();

            if (!firstChunkTime) {
              firstChunkTime = currentTime;
            }
            lastChunkTime = currentTime;

            if (chunk.isComplete && chunk.usage) {
              expect(chunk.usage.time_cost).toBeGreaterThan(0);
              expect(chunk.usage.time_cost).toBeLessThanOrEqual(
                currentTime - startTime + 1000,
              ); // Allow some buffer
            }
          },
        },
      );

      expect(result.isStreamed).toBe(true);
      expect(firstChunkTime).toBeDefined();
      expect(lastChunkTime).toBeDefined();
      expect(lastChunkTime!).toBeGreaterThanOrEqual(firstChunkTime!);

      if (result.usage) {
        expect(result.usage.time_cost).toBeGreaterThan(0);
      }
    });

    it('should fallback to non-streaming when onChunk is missing', async () => {
      const result = await callAI(
        [
          {
            role: 'user',
            content: 'What is programming?',
          },
        ],
        defaultModelConfig,
        {
          stream: true,
          // onChunk is intentionally omitted
        },
      );

      // Should fallback to non-streaming mode
      expect(result.isStreamed).toBe(false);
      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.usage).toBeDefined();
    });
  },
);
