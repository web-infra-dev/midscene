import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import {
  fullTimeStrWithMilliseconds,
  iconForStatus,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Input, Select, Tooltip } from 'antd';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaywrightTasks } from '../../types';
import './index.less';
import { type DumpStoreType, useExecutionDump } from '../store';

// define all possible test statuses
const TEST_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'timedOut', label: 'Timeout' },
  { value: 'interrupted', label: 'Interrupted' },
];

interface PlaywrightCaseSelectorProps {
  dumps?: PlaywrightTasks[];
  selected?: GroupedActionDump | null;
  onSelect?: (dump: GroupedActionDump) => void;
}

type TimingRange = {
  earliest: number;
  latest: number;
  duration: number;
};

const getTimingRangeFromTasks = (tasks: GroupedActionDump['executions']) => {
  let earliest: number | null = null;
  let latest: number | null = null;

  tasks.forEach((execution) => {
    execution.tasks.forEach((task) => {
      const timestamps = [task.timing?.start, task.timing?.end].filter(
        (timestamp): timestamp is number => typeof timestamp === 'number',
      );

      timestamps.forEach((timestamp) => {
        earliest = earliest === null ? timestamp : Math.min(earliest, timestamp);
        latest = latest === null ? timestamp : Math.max(latest, timestamp);
      });
    });
  });

  if (earliest === null || latest === null) {
    return null;
  }

  return {
    earliest,
    latest,
    duration: Math.max(0, latest - earliest),
  };
};

export function PlaywrightCaseSelector({
  dumps,
}: PlaywrightCaseSelectorProps): JSX.Element | null {
  if (!dumps || dumps.length <= 1) return null;

  const selected = useExecutionDump((store: DumpStoreType) => store.dump);
  const playwrightAttributes = useExecutionDump(
    (store) => store.playwrightAttributes,
  );
  const setGroupedDump = useExecutionDump(
    (store: DumpStoreType) => store.setGroupedDump,
  );
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasSearchText, setHasSearchText] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is on Select dropdown
      const target = event.target as HTMLElement;
      const isSelectDropdown = target.closest('.ant-select-dropdown');

      if (
        isExpanded &&
        selectorRef.current &&
        !selectorRef.current.contains(event.target as Node) &&
        !isSelectDropdown
      ) {
        setIsExpanded(false);
      }
    };

    const handleScroll = () => {
      if (isExpanded && selectorRef.current) {
        const rect = selectorRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 10,
          left: rect.left,
        });
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isExpanded]);

  const titleForDump = (dump: PlaywrightTasks, key: React.Key) => {
    const status = iconForStatus(dump.attributes?.playwright_test_status);
    const dumpContent = dump.get();
    const timingRange = dumpContent?.executions
      ? getTimingRangeFromTasks(dumpContent.executions)
      : null;
    const duration =
      timingRange?.duration ?? dump.attributes?.playwright_test_duration;
    const cost = typeof duration === 'number' ? (
      <span key={key} className="cost-str">
        {' '}
        {timingRange ? (
          <Tooltip
            title={
              <div>
                <div>
                  Start: {fullTimeStrWithMilliseconds(timingRange.earliest)}
                </div>
                <div>End: {fullTimeStrWithMilliseconds(timingRange.latest)}</div>
              </div>
            }
          >
            ({timeCostStrElement(duration)})
          </Tooltip>
        ) : (
          <>({timeCostStrElement(duration)})</>
        )}
      </span>
    ) : null;
    const rowContent = (
      <span key={key}>
        {status}
        {'  '}
        {`${dump.attributes.playwright_test_title || 'unnamed'} - ${dump.attributes.playwright_test_description || ''}`}
        {cost}
      </span>
    );
    return rowContent;
  };

  const filteredDumps = useMemo(() => {
    let result = dumps || [];

    // apply text filter
    if (searchText) {
      result = result.filter(
        (dump) =>
          (dump.attributes.playwright_test_title || '')
            .toLowerCase()
            .includes(searchText.toLowerCase()) ||
          (dump.attributes.playwright_test_description || '')
            .toLowerCase()
            .includes(searchText.toLowerCase()),
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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchText(value);
    setHasSearchText(value.length > 0);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
  };

  const toggleExpanded = () => {
    if (!isExpanded && selectorRef.current) {
      const rect = selectorRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 10,
        left: rect.left,
      });
    }
    setIsExpanded(!isExpanded);
  };

  const handlePlaywrightTaskSelect = (dump: PlaywrightTasks) => {
    setGroupedDump(dump.get(), dump.attributes);
    setIsExpanded(false);
  };

  const selectedTimingRange = useMemo(() => {
    if (!selected?.executions) return null;
    return getTimingRangeFromTasks(selected.executions);
  }, [selected]);

  const selectedDuration =
    selectedTimingRange?.duration ??
    playwrightAttributes?.playwright_test_duration ??
    0;

  const displayText = selected ? (
    <span>
      {selected.groupName} -{' '}
      {selectedTimingRange ? (
        <Tooltip
          title={
            <div>
              <div>
                Start: {fullTimeStrWithMilliseconds(selectedTimingRange.earliest)}
              </div>
              <div>
                End: {fullTimeStrWithMilliseconds(selectedTimingRange.latest)}
              </div>
            </div>
          }
        >
          ({timeCostStrElement(selectedDuration)})
        </Tooltip>
      ) : (
        <>({timeCostStrElement(selectedDuration)})</>
      )}
    </span>
  ) : (
    'Select a case'
  );

  return (
    <div
      ref={selectorRef}
      className={`modern-playwright-selector ${isExpanded ? 'expanded' : ''}`}
    >
      {/* Header */}
      <div className="selector-header" onClick={toggleExpanded}>
        <div className="header-content">
          <span className="check-icon">
            {iconForStatus(playwrightAttributes?.playwright_test_status || '')}
          </span>
          <span className="header-text">{displayText}</span>
        </div>
        <div className="arrow-icon">
          {isExpanded ? <UpOutlined /> : <DownOutlined />}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div
          className="selector-content"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          {/* Filter Controls */}
          <div className="filter-controls" onClick={(e) => e.stopPropagation()}>
            <div
              className={`search-container ${hasSearchText ? 'has-content' : ''}`}
            >
              <Select
                value={statusFilter}
                onChange={handleStatusChange}
                style={{ width: 120 }}
                options={TEST_STATUS_OPTIONS}
                size="small"
                variant="borderless"
                popupMatchSelectWidth={false}
                getPopupContainer={() => document.body}
              />
              <div className="search-input-container">
                <Input
                  placeholder="Search by name"
                  value={searchText}
                  onChange={handleSearchChange}
                  suffix={<SearchOutlined style={{ color: '#ccc' }} />}
                  variant="borderless"
                />
              </div>
            </div>
          </div>

          {/* Options List */}
          <div className="options-list">
            {filteredDumps.map((dump, index) => (
              <div
                key={index}
                className={`option-item ${playwrightAttributes?.playwright_test_id === dump.attributes.playwright_test_id ? 'selected' : ''}`}
                onClick={() => handlePlaywrightTaskSelect(dump)}
              >
                <div className="option-content">
                  {titleForDump(dump, index)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
