/** Select ordered indices that include both endpoints and span the full input. */
export function selectEvenlySpacedIndices(
  itemCount: number,
  limit: number,
): number[] {
  if (itemCount <= 0 || limit <= 0) return [];
  if (limit === 1) return [0];
  if (itemCount <= limit) {
    return Array.from({ length: itemCount }, (_, index) => index);
  }
  return Array.from({ length: limit }, (_, index) =>
    Math.round((index * (itemCount - 1)) / (limit - 1)),
  );
}
