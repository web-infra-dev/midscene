import { incutPlaygroundImportAssets } from '../../assets';
import { IncutExecutionFlow } from './ExecutionFlow';

export function IncutImportedPlaygroundPanel() {
  const { main } = incutPlaygroundImportAssets;

  return (
    <div className="relative flex h-full w-[400px] flex-col rounded-br-[12px] rounded-tr-[12px] bg-white">
      <div className="absolute left-0 top-0 z-10 flex h-[56px] w-full items-center border-b border-[#ececec] bg-white px-[22px]">
        <span className="flex h-[23px] w-[71px] items-center overflow-hidden whitespace-nowrap font-['Inter'] text-[13px] font-medium text-[#0d0d0d]">
          Playground
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 pb-8 pt-[52px]">
        <div className="flex w-full justify-end">
          <div className="flex h-[38px] w-[174px] flex-shrink-0 items-center rounded-[12px] bg-[#f2f4f7] px-4 py-2">
            <span className="h-[22px] w-[142px] overflow-hidden whitespace-nowrap font-['Inter'] text-[14px] leading-[22px] text-black">
              点赞 midscene github
            </span>
          </div>
        </div>

        <div className="-mt-[6px] flex w-[368px] flex-col items-start gap-4">
          <div className="w-full font-['PingFang_SC'] text-[14px] leading-[22px] text-black">
            我需要在Google搜索框中输入&quot;midscene&quot;，然后全选并删除内容。首先需要点击搜索框激活它。我应该先点击Google搜索框使其激活，这样才能输入文本。搜索框位于页面中央，点击后就可以开始输入内容。
          </div>

          <IncutExecutionFlow />

          <div className="mt-3 w-full font-['Inter'] text-[14px] leading-[22px] text-black">
            我将为您生成一个迷幻液体颗粒噪点弥散光模糊扭曲渐变潮流背景底纹。
          </div>
        </div>
      </div>

      <div className="flex h-[132px] flex-col justify-center rounded-b-[24px] border-t border-[#ececec] bg-white p-3">
        <div className="flex h-[120px] flex-col justify-between rounded-[24px] border border-[#e8e8e8] p-3">
          <span className="mt-1 flex h-[17px] items-center overflow-hidden whitespace-nowrap font-['Inter'] text-[14px] leading-[16.9px] text-black/25">
            Type a message
          </span>

          <div className="flex h-8 items-center justify-between">
            <div className="flex h-8 items-center gap-1">
              <div className="flex h-8 cursor-pointer items-center gap-1 rounded-[32px] px-2 py-1 transition-colors hover:bg-gray-50">
                <img alt="action" className="h-4 w-4" src={main.action} />
                <span className="flex h-4 w-[37px] items-center font-['Inter'] text-[12px] font-medium text-[#878787]">
                  Action
                </span>
                <img
                  alt="chevron"
                  className="-ml-0.5 h-[9.3px] w-[5.3px] -rotate-90 object-contain opacity-25"
                  src={main.actionChevron}
                />
              </div>

              <div className="flex h-8 cursor-pointer items-center justify-center rounded-[32px] px-2 py-1 transition-colors hover:bg-gray-50">
                <img
                  alt="tool"
                  className="h-4 w-4 -translate-y-px"
                  src={main.tool}
                />
              </div>

              <div className="ml-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-[32px] transition-colors hover:bg-gray-50">
                <img
                  alt="settings"
                  className="h-[14px] w-[13.9px] object-contain"
                  src={main.settings}
                />
              </div>
            </div>

            <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#cce3ff] transition-colors hover:bg-[#b8d7ff]">
              <img
                alt="send"
                className="h-3 w-3 -rotate-180 object-contain"
                src={main.actionChevron}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
