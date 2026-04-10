import './globals.css';
import MainContent from '../MainContent';
import Playground from '../Playground';
import Sidebar, { SidebarFooter } from '../Sidebar';

export default function IncutAreaAllInOne() {
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#F6F6F6] font-sans"
      data-incut-root="incut-scene-replica"
      data-reference-id="7780:177790"
    >
      <div className="absolute left-0 top-0 h-full w-[240px]">
        <div
          className="absolute left-[4px] top-[52px] w-[232px] overflow-hidden"
          data-reference-id="7911:68208"
        >
          <Sidebar />
        </div>

        <div
          className="absolute bottom-[6px] left-[4px] w-[232px]"
          data-reference-id="7780:177921"
        >
          <SidebarFooter />
        </div>
      </div>

      <div
        className="absolute top-[4px] right-[4px] bottom-[4px] left-[240px] flex rounded-[12px] bg-white"
        data-reference-id="7780:177942"
      >
        <MainContent />
        <Playground />
      </div>
    </div>
  );
}
