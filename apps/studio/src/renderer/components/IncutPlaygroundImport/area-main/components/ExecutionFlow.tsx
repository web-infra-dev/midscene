import { incutPlaygroundImportAssets } from '../../assets';

interface IncutExecutionStepProps {
  content: string;
  iconUrl: string;
  isLast?: boolean;
  label: string;
  fontFamily?: string;
  labelFontFamily?: string;
}

function IncutExecutionStep({
  content,
  fontFamily = 'Inter',
  iconUrl,
  isLast,
  label,
  labelFontFamily = 'Inter',
}: IncutExecutionStepProps) {
  return (
    <div className="relative flex h-[66px] w-[288px] gap-2 rounded-lg">
      {!isLast ? (
        <div className="absolute left-4 top-6 h-[66px] w-px bg-black/8" />
      ) : null}

      <div className="flex w-8 flex-col items-center pt-1">
        <div className="flex w-2 justify-center" />
      </div>

      <div className="flex flex-1 flex-col gap-2 pb-1 pt-1">
        <div className="flex h-7 w-fit items-center gap-1 rounded-[38px] bg-black/8 px-1 pr-2 py-0.5">
          <div className="flex h-6 w-6 items-center justify-center">
            <img alt="" className="h-6 w-6" src={iconUrl} />
          </div>
          <span
            className="flex h-[22px] items-center overflow-hidden whitespace-nowrap text-[14px] text-black/85"
            style={{ fontFamily: labelFontFamily }}
          >
            {label}
          </span>
        </div>
        <div
          className="h-[22px] overflow-hidden whitespace-nowrap text-[14px] leading-[22px] text-black/85"
          style={{ fontFamily }}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

export function IncutExecutionFlow() {
  const { execution } = incutPlaygroundImportAssets;

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-4 flex w-[304px] flex-col gap-2 rounded-2xl">
        <div className="flex h-[15px] w-[68px] items-center gap-2 px-1">
          <span className="h-[15px] overflow-hidden whitespace-nowrap font-['Inter'] text-[12px] leading-[15px] font-medium text-black/50">
            执行流程
          </span>
          <img
            alt="expand"
            className="h-3 w-3 rotate-90 object-contain"
            src={execution.chevron}
          />
        </div>

        <div className="flex w-[288px] flex-col rounded-lg">
          <IncutExecutionStep
            content="search relax"
            iconUrl={execution.planningPrimary}
            label="Planning"
          />
          <IncutExecutionStep
            content="百度首页的搜索输入框"
            fontFamily="PingFang SC"
            iconUrl={execution.locateNode}
            label="Insight / Locate"
            labelFontFamily="PingFang SC"
          />
          <IncutExecutionStep
            content="百度首页"
            iconUrl={execution.locateField}
            label="Insight / Locate"
          />
          <IncutExecutionStep
            content="Input"
            iconUrl={execution.input}
            label="Insight / Locate"
          />
          <IncutExecutionStep
            content="Tap"
            iconUrl={execution.tap}
            label="Insight / Locate"
          />
          <IncutExecutionStep
            content="search relax"
            iconUrl={execution.planningSecondary}
            isLast
            label="Planning"
          />
        </div>
      </div>
    </div>
  );
}
