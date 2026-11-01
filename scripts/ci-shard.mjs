// Greedy duration balancing keeps every discovered file in exactly one shard.
// Unknown/new files receive the median-sized default rather than being omitted.
export function shardFiles(files, shard, durations = {}) {
  if (!shard) return [...files].sort();
  const match = /^(\d+)\/(\d+)$/.exec(shard);
  if (!match) throw new Error(`Invalid shard: ${shard}; expected index/count`);
  const [, index, count] = match.map(Number);
  if (index < 1 || index > count || count > files.length) {
    throw new Error(`Shard ${shard} is out of range for ${files.length} files`);
  }
  if (new Set(files).size !== files.length)
    throw new Error('Duplicate test files');
  const buckets = Array.from({ length: count }, () => ({
    files: [],
    seconds: 0,
  }));
  const duration = (file) => durations[file] ?? 300;
  for (const file of [...files].sort(
    (a, b) => duration(b) - duration(a) || a.localeCompare(b),
  )) {
    const bucket = buckets.reduce((a, b) => (a.seconds <= b.seconds ? a : b));
    bucket.files.push(file);
    bucket.seconds += duration(file);
  }
  return buckets[index - 1].files.sort();
}
