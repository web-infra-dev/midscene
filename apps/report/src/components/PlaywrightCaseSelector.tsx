import { DownOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { iconForStatus, timeCostStrElement } from '@midscene/visualizer';
import { Dropdown } from 'antd';
import type React from 'react';
import type { ExecutionDumpWithPlaywrightAttributes } from '../types';

interface PlaywrightCaseSelectorProps {
  dumps?: ExecutionDumpWithPlaywrightAttributes[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}

export function PlaywrightCaseSelector({
  dumps,
  selected,
  onSelect,
}: PlaywrightCaseSelectorProps): JSX.Element | null {
  if (!dumps || dumps.length <= 1) return null;

  const nameForDump = (dump: GroupedActionDump) =>
    `${dump.groupName} - ${dump.groupDescription}`;

  const contentForDump = (
    dump: ExecutionDumpWithPlaywrightAttributes,
    key: React.Key,
  ) => {
    const status = iconForStatus(dump.attributes?.playwright_test_status);
    const costStr = dump.attributes?.playwright_test_duration;
    const cost = costStr ? (
      <span key={key} className="cost-str">
        {' '}
        ({timeCostStrElement(Number.parseInt(costStr, 10))})
      </span>
    ) : null;
    const rowContent = (
      <span key={key}>
        {status}
        {'  '}
        {nameForDump(dump)}
        {cost}
      </span>
    );
    return rowContent;
  };

  const items = (dumps || []).map((dump, index) => {
    return {
      key: index,
      label: (
        <a
          onClick={(e) => {
            e.preventDefault();
            if (onSelect) {
              onSelect(dump);
            }
          }}
        >
          <div>{contentForDump(dump, index)}</div>
        </a>
      ),
    };
  });

  const btnName = selected
    ? contentForDump(
        selected as ExecutionDumpWithPlaywrightAttributes,
        'selector',
      )
    : 'Select a case';

  return (
    <div className="playwright-case-selector">
      <Dropdown menu={{ items }}>
        <a onClick={(e) => e.preventDefault()}>
          {btnName} <DownOutlined />
        </a>
      </Dropdown>
    </div>
  );
}
