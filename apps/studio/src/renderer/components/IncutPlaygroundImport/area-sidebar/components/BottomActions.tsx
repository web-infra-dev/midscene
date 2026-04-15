import { incutPlaygroundImportAssets } from '../../assets';

export function IncutSidebarBottomActions() {
  return (
    <div className="mt-auto mb-1 flex h-8 items-center px-2 font-['PingFang_SC',_'Inter']">
      <div className="mr-auto flex h-[30px] cursor-pointer items-center rounded-lg px-1 hover:bg-black/3">
        <img
          alt="settings"
          className="h-4 w-4 object-contain"
          src={incutPlaygroundImportAssets.sidebar.settings}
        />
        <span className="ml-[6px] h-[22px] overflow-hidden whitespace-nowrap text-[13px] leading-[22px] text-[#474848]">
          设置
        </span>
      </div>

      <div className="flex items-center gap-1">
        {['模型', '环境'].map((label) => (
          <div
            className="flex h-6 w-[38.1px] cursor-pointer items-center justify-center rounded-lg border border-black/8 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            key={label}
          >
            <span className="whitespace-nowrap text-[11px] leading-3 text-[#474848]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
