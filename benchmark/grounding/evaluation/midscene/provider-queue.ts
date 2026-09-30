import type { MidsceneEvaluationPlanItem } from './types.js';

type IndexedPlanItem = {
  item: MidsceneEvaluationPlanItem;
  itemIndex: number;
};

export type ProviderExecutionQueue = {
  providerId: string;
  items: IndexedPlanItem[];
};

function interleaveItemsByModel(items: IndexedPlanItem[]): IndexedPlanItem[] {
  const itemsByModel = new Map<string, IndexedPlanItem[]>();

  for (const current of items) {
    const modelItems = itemsByModel.get(current.item.model.id) ?? [];
    modelItems.push(current);
    itemsByModel.set(current.item.model.id, modelItems);
  }

  const modelQueues = Array.from(itemsByModel.values());
  const interleaved: IndexedPlanItem[] = [];
  for (let offset = 0; interleaved.length < items.length; offset += 1) {
    for (const modelItems of modelQueues) {
      const current = modelItems[offset];
      if (current) {
        interleaved.push(current);
      }
    }
  }

  return interleaved;
}

export function buildProviderExecutionQueues(
  items: MidsceneEvaluationPlanItem[],
): ProviderExecutionQueue[] {
  const queues = new Map<string, ProviderExecutionQueue>();
  const orderedQueues: ProviderExecutionQueue[] = [];

  items.forEach((item, itemIndex) => {
    let queue = queues.get(item.model.providerId);
    if (!queue) {
      queue = {
        providerId: item.model.providerId,
        items: [],
      };
      queues.set(item.model.providerId, queue);
      orderedQueues.push(queue);
    }

    queue.items.push({ item, itemIndex });
  });

  return orderedQueues;
}

export async function runByProviderQueue<T>(
  items: MidsceneEvaluationPlanItem[],
  runner: (
    item: MidsceneEvaluationPlanItem,
    itemIndex: number,
    workerIndex: number,
  ) => Promise<T>,
  options: {
    providerConcurrency?: number;
    shouldStop?: () => boolean;
  } = {},
): Promise<T[]> {
  const results = new Array<T>(items.length);
  const queues = buildProviderExecutionQueues(items);
  const configuredConcurrency = options.providerConcurrency ?? 1;
  const providerConcurrency = Number.isFinite(configuredConcurrency)
    ? Math.min(5, Math.max(1, Math.floor(configuredConcurrency)))
    : 1;

  await Promise.all(
    queues.map(async (queue) => {
      let nextItemIndex = 0;
      const scheduledItems =
        providerConcurrency === 1
          ? queue.items
          : interleaveItemsByModel(queue.items);
      const workerCount = Math.min(providerConcurrency, scheduledItems.length);

      await Promise.all(
        Array.from({ length: workerCount }, async (_, workerIndex) => {
          while (nextItemIndex < scheduledItems.length) {
            if (options.shouldStop?.()) {
              return;
            }

            const current = scheduledItems[nextItemIndex];
            nextItemIndex += 1;
            results[current.itemIndex] = await runner(
              current.item,
              current.itemIndex,
              workerIndex,
            );
          }
        }),
      );
    }),
  );

  return results;
}
