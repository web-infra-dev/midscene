import { DownOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons';
import type { GroupedActionDump } from '@midscene/core';
import {
  fullTimeStrWithMilliseconds,
  iconForStatus,
  timeCostStrElement,
} from '@midscene/visualizer';
import { Input, Tooltip } from 'antd';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlaywrightTaskAttributes, PlaywrightTasks } from '../../types';
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

const STATUS_DISPLAY_LABEL: Partial<
  Record<PlaywrightTaskAttributes['playwright_test_status'], string>
> = {
  timedOut: 'timed out',
  interrupted: 'interrupted',
  skipped: 'skipped',
};

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
        earliest =
          earliest === null ? timestamp : Math.min(earliest, timestamp);
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

function PlaywrightCaseTitle(props: {
  attributes: Pick<
    PlaywrightTaskAttributes,
    | 'playwright_test_title'
    | 'playwright_test_description'
    | 'playwright_test_duration'
    | 'playwright_test_status'
  >;
  timingRange?: TimingRange | null;
}): JSX.Element {
  const { attributes, timingRange } = props;
  const status = iconForStatus(attributes.playwright_test_status);
  const duration = timingRange?.duration ?? attributes.playwright_test_duration;
  const extraStatusLabel =
    STATUS_DISPLAY_LABEL[attributes.playwright_test_status];
  const cost =
    typeof duration === 'number' ? (
      <span className="cost-str">
        {' '}
        {timingRange ? (
          <Tooltip
            title={
              <div>
                <div>
                  Start: {fullTimeStrWithMilliseconds(timingRange.earliest)}
                </div>
                <div>
                  End: {fullTimeStrWithMilliseconds(timingRange.latest)}
                </div>
              </div>
            }
          >
            ({timeCostStrElement(duration)}
            {extraStatusLabel ? `, ${extraStatusLabel}` : ''})
          </Tooltip>
        ) : (
          <>
            ({timeCostStrElement(duration)}
            {extraStatusLabel ? `, ${extraStatusLabel}` : ''})
          </>
        )}
      </span>
    ) : null;

  return (
    <span>
      {status}
      {'  '}
      {attributes.playwright_test_title || 'unnamed'}
      {attributes.playwright_test_description
        ? ` - ${attributes.playwright_test_description}`
        : ''}
      {cost}
    </span>
  );
}

export function PlaywrightCaseSelector({
  dumps,
}: PlaywrightCaseSelectorProps): JSX.Element | null {
  if (!dumps || dumps.length === 0) return null;
  if (dumps.length === 1 && !dumps[0].attributes?.is_merged) return null;

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
    const dumpContent = dump.get();
    const timingRange = dumpContent?.executions
      ? getTimingRangeFromTasks(dumpContent.executions)
      : null;
    return (
      <PlaywrightCaseTitle
        key={key}
        attributes={dump.attributes}
        timingRange={timingRange}
      />
    );
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

  const handlePlaywrightTaskSelect = async (dump: PlaywrightTasks) => {
    await setGroupedDump(dump.get(), dump.attributes);
    setIsExpanded(false);
  };

  const selectedTimingRange = useMemo(() => {
    if (!selected?.executions) return null;
    return getTimingRangeFromTasks(selected.executions);
  }, [selected]);

  const displayHeader = playwrightAttributes ? (
    <PlaywrightCaseTitle
      attributes={playwrightAttributes}
      timingRange={selectedTimingRange}
    />
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
        <div className="header-content">{displayHeader}</div>
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
              <select
                aria-label="Filter test cases by status"
                className="status-filter-select"
                value={statusFilter}
                onChange={(event) => handleStatusChange(event.target.value)}
              >
                {TEST_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
