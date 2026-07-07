import { anchorIdForTask, findTaskByAnchor } from '@/utils/task-anchor';
import { useEffect } from 'react';
import { useExecutionDump } from './index';

/**
 * Keep the URL hash and the active sidebar task in sync:
 * - On load (and whenever the hash changes), select the task the hash points at
 *   and scroll its sidebar row into view, so reports are deep-linkable.
 * - When the active task changes, reflect it into the hash via `replaceState`
 *   (no extra history entries, and it does not re-trigger the hash listener).
 */
export function useTaskHashAnchor(): void {
  const dump = useExecutionDump((store) => store.dump);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const replayAllMode = useExecutionDump((store) => store.replayAllMode);
  const setActiveTask = useExecutionDump((store) => store.setActiveTask);

  // Hash -> active task (initial deep-link + manual hash navigation).
  useEffect(() => {
    if (!dump) return;

    const applyHash = () => {
      const hash = window.location.hash;
      if (!hash || hash === '#') return;
      const task = findTaskByAnchor(dump, hash);
      if (!task) return;
      setActiveTask(task);
      // Scroll the matching row into view once it has been rendered.
      requestAnimationFrame(() => {
        document
          .getElementById(hash.slice(1))
          ?.scrollIntoView({ block: 'nearest' });
      });
    };

    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [dump, setActiveTask]);

  // Active task -> hash. Skip while replaying all so the play-all view keeps
  // whatever anchor was last shared.
  useEffect(() => {
    if (!dump || replayAllMode || !activeTask) return;
    const target = `#${anchorIdForTask(activeTask)}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target);
    }
  }, [dump, activeTask, replayAllMode]);
}
