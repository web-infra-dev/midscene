import './globals.css';
import MainContent from '../MainContent';
import Playground from '../Playground';
import Sidebar, { SidebarFooter } from '../Sidebar';

export default function ShellLayout() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F6F6F6] font-sans">
      <div className="absolute left-0 top-0 h-full w-[240px]">
        <div className="absolute left-[4px] top-[52px] w-[232px] overflow-hidden">
          <Sidebar />
        </div>

        <div className="absolute bottom-[6px] left-[4px] w-[232px]">
          <SidebarFooter />
        </div>
      </div>

      <div className="absolute top-[4px] right-[4px] bottom-[4px] left-[240px] flex rounded-[12px] bg-white">
        <MainContent />
        <Playground />
      </div>
    </div>
  );
}
