import { useLocation } from '@rspress/core/runtime';
import { Sidebar as OriginalSidebar } from '@rspress/core/theme-original';
import { isGetStartedPathPage } from './get-started-plan';
import './Sidebar.css';

// Rspress highlights a sidebar item only when its link equals the current
// route, so "Get started" (`/get-started`) is not highlighted on the path
// pages under it. Mark those pages so Sidebar.css can highlight the item.
export function Sidebar() {
  const { pathname } = useLocation();
  if (!isGetStartedPathPage(pathname)) return <OriginalSidebar />;
  return (
    <div className="midscene-sidebar-get-started-path">
      <OriginalSidebar />
    </div>
  );
}
