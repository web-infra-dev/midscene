import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { iconForStatus, timeCostStrElement } from '@midscene/visualizer';
import { Dropdown, Input } from 'antd';
import type React from 'react';
import { useMemo, useState } from 'react';
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

  const [searchText, setSearchText] = useState('');
  const [dropdownVisible, setDropdownVisible] = useState(false);

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

  const filteredDumps = useMemo(() => {
    if (!searchText) return dumps || [];
    return (dumps || []).filter((dump) =>
      nameForDump(dump).toLowerCase().includes(searchText.toLowerCase()),
    );
  }, [dumps, searchText]);

  const items = filteredDumps.map((dump, index) => {
    return {
      key: index,
      label: (
        <a
          onClick={(e) => {
            e.preventDefault();
            if (onSelect) {
              onSelect(dump);
            }
            setDropdownVisible(false);
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const dropdownRender = (menu: React.ReactNode) => (
    <div>
      <div style={{ padding: '8px' }}>
        <Input
          placeholder="Search test case"
          value={searchText}
          onChange={handleSearchChange}
          prefix={<SearchOutlined />}
          allowClear
          autoFocus
        />
      </div>
      {menu}
    </div>
  );

  return (
    <div className="playwright-case-selector">
      <Dropdown
        menu={{ items }}
        dropdownRender={dropdownRender}
        onOpenChange={setDropdownVisible}
        open={dropdownVisible}
      >
        <a
          onClick={(e) => {
            e.preventDefault();
            setDropdownVisible(!dropdownVisible);
          }}
        >
          {btnName} <DownOutlined />
        </a>
      </Dropdown>
    </div>
  );
}
