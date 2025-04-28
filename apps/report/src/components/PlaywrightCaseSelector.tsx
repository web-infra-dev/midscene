import { DownOutlined, SearchOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import { iconForStatus, timeCostStrElement } from '@midscene/visualizer';
import { Dropdown, Input, Select, Space } from 'antd';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { ExecutionDumpWithPlaywrightAttributes } from '../types';

// define all possible test statuses
const TEST_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'timedOut', label: 'Timed Out' },
  { value: 'interrupted', label: 'Interrupted' },
];

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
  const [statusFilter, setStatusFilter] = useState('all');
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
    let result = dumps || [];

    // apply text filter
    if (searchText) {
      result = result.filter((dump) =>
        nameForDump(dump).toLowerCase().includes(searchText.toLowerCase()),
      );
    }

    // apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(
        (dump) => dump.attributes?.playwright_test_status === statusFilter,
      );
    }

    return result;
  }, [dumps, searchText, statusFilter]);

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

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
  };

  const dropdownRender = (menu: React.ReactNode) => (
    <div>
      <div style={{ padding: '8px' }}>
        <Space style={{ width: '100%' }}>
          <Input
            placeholder="Search test case"
            value={searchText}
            onChange={handleSearchChange}
            prefix={<SearchOutlined />}
            allowClear
            autoFocus
            style={{ flex: 1 }}
          />
          <Select
            value={statusFilter}
            onChange={handleStatusChange}
            style={{ width: 120 }}
            options={TEST_STATUS_OPTIONS}
          />
        </Space>
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
