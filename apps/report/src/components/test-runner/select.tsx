import { Select as AntdSelect } from 'antd';
import type { SelectProps } from 'antd';

export const getSelectTheme = (isDarkMode: boolean) => ({
  optionSelectedBg: isDarkMode ? '#2a2d32' : '#f3f3f4',
  optionActiveBg: isDarkMode ? '#2a2d32' : '#f3f3f4',
  optionSelectedFontWeight: 500,
  activeBorderColor: isDarkMode ? '#595d63' : '#d9d9dc',
  hoverBorderColor: isDarkMode ? '#595d63' : '#d9d9dc',
  activeOutlineColor: 'transparent',
});

export function Select<ValueType>({
  className,
  popupClassName,
  getPopupContainer,
  ...props
}: SelectProps<ValueType>): JSX.Element {
  return (
    <AntdSelect<ValueType>
      {...props}
      variant="borderless"
      getPopupContainer={
        getPopupContainer ??
        ((triggerNode) =>
          (triggerNode.closest('.test-runner-report') as HTMLElement | null) ??
          document.body)
      }
      className={['runner-report-select', className].filter(Boolean).join(' ')}
      popupClassName={['runner-select-dropdown', popupClassName]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
