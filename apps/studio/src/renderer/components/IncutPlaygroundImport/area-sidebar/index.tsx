import { incutPlaygroundImportAssets } from '../assets';
import { IncutSidebarBottomActions } from './components/BottomActions';
import { IncutSidebarNavItem } from './components/NavItem';

export function IncutImportedSidebar() {
  return (
    <div className="flex h-[820px] w-[240px] flex-col overflow-hidden border-r border-[#ececec] bg-[#f6f6f6bf] font-['Inter',_'PingFang_SC']">
      <div className="flex items-center justify-between px-[13px] pb-1 pt-4">
        <img
          alt="window controls"
          className="h-3 w-[52px] object-contain"
          src={incutPlaygroundImportAssets.sidebar.windowControls}
        />
        <div className="flex h-3.5 w-4 cursor-pointer items-center justify-center opacity-80 hover:opacity-100">
          <div className="relative h-[14px] w-4 rounded-[2px] border-[1.2px] border-[#818283]">
            <div className="absolute left-1/2 top-1/2 h-2 w-[1.2px] -translate-x-1/2 -translate-y-1/2 bg-[#818283]" />
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-col overflow-hidden px-1">
        <IncutSidebarNavItem
          count="4"
          fontWeight="500"
          gap={6}
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.overview}
          label="设备总览"
          labelWidth={52}
        />

        <div className="mt-1 flex h-8 items-center px-3">
          <span className="text-[13px] leading-[22px] font-medium text-[#9da0a1]">
            Platform
          </span>
        </div>

        <IncutSidebarNavItem
          fontWeight="500"
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.android}
          label="Android"
          labelWidth={49}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.androidActive}
          fontWeight="500"
          isActive
          isSubItem
          label="三星 Galaxy S26 Ultra"
          labelHeight={23}
          labelWidth={158}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.androidIdleOne}
          isSubItem
          label="三星 Galaxy S26 Ultra"
          labelHeight={16}
          labelWidth={158}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.androidIdleTwo}
          isSubItem
          label="三星 Galaxy S26 Ultra"
          labelHeight={16}
          labelWidth={158}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.androidIdleThree}
          isLastSubItem
          isSubItem
          label="三星 Galaxy S26 Ultra"
          labelHeight={16}
          labelWidth={158}
        />

        <IncutSidebarNavItem
          fontWeight="500"
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.ios}
          label="iOS"
          labelWidth={22}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.iosActive}
          isSubItem
          label="iPhone 12 Pro Max"
          labelHeight={16}
          labelWidth={158}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.iosIdle}
          isLastSubItem
          isSubItem
          label="iPhone 17 Pro"
          labelHeight={16}
          labelWidth={158}
        />

        <IncutSidebarNavItem
          fontWeight="500"
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.computer}
          label="Computer"
          labelWidth={63}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.computerIdle}
          isLastSubItem
          isSubItem
          label="Macbook pro 16"
          labelHeight={16}
          labelWidth={158}
        />

        <IncutSidebarNavItem
          count="0"
          fontWeight="500"
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.harmony}
          label="HarmonyOS"
          labelWidth={75}
        />
        <IncutSidebarNavItem
          customRadius={10}
          dotUrl={incutPlaygroundImportAssets.sidebar.harmonyIdleOne}
          isSubItem
          label="华为P50(鸿蒙3.0.0)"
          labelHeight={16}
          labelWidth={158}
        />
        <IncutSidebarNavItem
          dotUrl={incutPlaygroundImportAssets.sidebar.harmonyIdleTwo}
          isLastSubItem
          isSubItem
          label="华为P50(鸿蒙3.0.0)"
          labelHeight={16}
          labelWidth={158}
        />

        <IncutSidebarNavItem
          fontWeight="500"
          hasArrow
          iconUrl={incutPlaygroundImportAssets.sidebar.web}
          label="Web"
          labelWidth={28}
        />
      </div>

      <IncutSidebarBottomActions />
    </div>
  );
}
