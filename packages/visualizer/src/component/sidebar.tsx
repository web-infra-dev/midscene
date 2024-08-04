import './sidebar.less';
import { useAllCurrentTasks, useExecutionDump } from '@/component/store';
import { typeStr } from '@/utils';
import {
  ArrowRightOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  LogoutOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import type { ExecutionTask, ExecutionTaskInsightQuery } from '@midscene/core';
import { Button } from 'antd';
import { useEffect } from 'react';
import Logo from './assets/logo-plain2.svg';
import { timeCostStrElement } from './misc';
import PanelTitle from './panel-title';

const SideItem = (props: {
  task: ExecutionTask;
  selected?: boolean;
  onClick?: () => void;
  onItemHover?: (task: ExecutionTask | null, x?: number, y?: number) => any;
}): JSX.Element => {
  const { task, onClick, selected } = props;

  const selectedClass = selected ? 'selected' : '';
  let statusIcon = <MinusOutlined />;
  if (task.status === 'success') {
    statusIcon = <CheckOutlined />;
  } else if (task.status === 'fail') {
    statusIcon = <CloseOutlined />;
  } else if (task.status === 'pending') {
    statusIcon = <ClockCircleOutlined />;
  } else if (task.status === 'cancelled') {
    statusIcon = <LogoutOutlined />;
  } else if (task.status === 'running') {
    statusIcon = <ArrowRightOutlined />;
  }

  let statusText: JSX.Element | string = task.status;
  if (task.timing?.cost) {
    statusText = timeCostStrElement(task.timing.cost);
  }

  let contentRow: JSX.Element | undefined;
  if (task.type === 'Planning') {
    contentRow = (
      <div className="side-item-content">{task.param?.userPrompt}</div>
    );
  } else if (task.type === 'Insight' && task.subType === 'Query') {
    // debugger;
    const demand = (task as ExecutionTaskInsightQuery).param?.dataDemand;
    const contentToShow =
      typeof demand === 'string' ? demand : JSON.stringify(demand);
    contentRow = <div className="side-item-content">{contentToShow}</div>;
  } else {
    // debugger;
  }
  // add hover listener
  return (
    <div
      className={`side-item ${selectedClass}`}
      onClick={onClick}
      // collect x,y (refer to the body) for hover preview
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width;
        const y = rect.top;
        props.onItemHover?.(task, x, y);
      }}
      onMouseLeave={() => {
        props.onItemHover?.(null);
      }}
    >
      {' '}
      <div className={'side-item-name'}>
        <span className={`status-icon status-icon-${task.status}`}>
          {statusIcon}
        </span>
        <div className="title">{typeStr(task)}</div>
        <div className="status-text">{statusText}</div>
      </div>
      {contentRow}
    </div>
  );
};

const Sidebar = (props: {
  hideLogo?: boolean;
  logoAction?: () => void;
}): JSX.Element => {
  const groupedDumps = useExecutionDump((store) => store.dump);
  const setActiveTask = useExecutionDump((store) => store.setActiveTask);
  const activeTask = useExecutionDump((store) => store.activeTask);
  const setHoverTask = useExecutionDump((store) => store.setHoverTask);
  const setHoverPreviewConfig = useExecutionDump(
    (store) => store.setHoverPreviewConfig,
  );
  // const selectedTaskIndex = useExecutionDump((store) => store.selectedTaskIndex);
  // const setSelectedTaskIndex = useExecutionDump((store) => store.setSelectedTaskIndex);
  const reset = useExecutionDump((store) => store.reset);

  const allTasks = useAllCurrentTasks();
  const currentSelectedIndex = allTasks?.findIndex(
    (task) => task === activeTask,
  );

  useEffect(() => {
    // all tasks
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!allTasks?.length || allTasks?.length <= 1) {
        return;
      }
      // should be command / ctrl + arrow
      if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = currentSelectedIndex - 1;
        if (nextIndex < 0) {
          return;
        }
        const nextTask = allTasks[nextIndex];
        setActiveTask(nextTask);
      } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = currentSelectedIndex + 1;
        if (nextIndex >= allTasks.length) {
          return;
        }
        const nextTask = allTasks[nextIndex];
        setActiveTask(nextTask);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentSelectedIndex, allTasks, setActiveTask]);

  const sideList = groupedDumps?.length ? (
    groupedDumps.map((group, groupIndex) => {
      const executions = group.executions.map((execution, indexOfExecution) => {
        const { tasks } = execution;
        const taskList = tasks.map((task, index) => {
          return (
            <SideItem
              key={index}
              task={task}
              selected={task === activeTask}
              onClick={() => {
                setActiveTask(task);
              }}
              onItemHover={(hoverTask, x, y) => {
                if (hoverTask && x && y) {
                  setHoverPreviewConfig({ x, y });
                  setHoverTask(hoverTask);
                } else {
                  setHoverPreviewConfig(null);
                  setHoverTask(null);
                }
              }}
            />
          );
        });
        let seperator: JSX.Element;
        switch (indexOfExecution) {
          case 0:
            seperator = (
              <div className="side-seperator side-seperator-space-up" />
            );
            break;
          // case group.executions.length - 1:
          //   seperator = <div className="side-seperator side-seperator-space-down" />;
          //   break;
          default:
            seperator = (
              <div className="side-seperator side-seperator-line side-seperator-space-up side-seperator-space-down" />
            );
            break;
        }
        return (
          <div key={indexOfExecution}>
            {seperator}
            <div className="side-sub-title">{execution.name}</div>
            {taskList}
          </div>
        );
      });
      return (
        <div key={groupIndex}>
          <PanelTitle title={group.groupName} />
          {executions}
        </div>
      );
    })
  ) : (
    <span>no tasks</span>
  );

  return (
    <div className="side-bar">
      <div className="top-controls">
        <div
          className="brand"
          onClick={reset}
          style={{ display: props?.hideLogo ? 'none' : 'flex' }}
        >
          <Logo
            style={{ width: 70, height: 70, margin: 'auto' }}
            onClick={() => {
              if (props.logoAction) {
                props.logoAction();
              } else {
                location.reload();
              }
            }}
          />
        </div>
        <div className="task-list">{sideList}</div>
        <div className="side-seperator side-seperator-line side-seperator-space-up" />
        <div className="task-meta-section">
          <div className="task-meta">switch: Command + Up / Down</div>
        </div>
      </div>
      <div className="bottom-controls">
        <Button onClick={reset} type="text" className="unload_btn">
          Unload
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
