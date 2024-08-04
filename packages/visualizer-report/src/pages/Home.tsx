import { useNavigate } from '@modern-js/runtime/router';
import { Collapse, Menu } from 'antd';
import type { CollapseProps, MenuProps } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import styeld from './Home.module.css';
import './TestResult.css';

type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped';

type TestData = {
  testId: string;
  title: string;
  status: string;
  duration: number;
  location: {
    file: string;
    line: number;
    column: number;
  };
  dumpPath: string;
};

type MenuItem = Required<MenuProps>['items'][number];
export type Stats = {
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  ok: boolean;
};

const statusIcon = (status: TestStatus) => {
  switch (status) {
    case 'failed':
      return <span className="failed">❌</span>;
    case 'flaky':
      return <span className="flaky">⚠️</span>;
    default:
      return '';
  }
};

const TestResult = (props: {
  status: string;
  statusDataList: {
    [status: string]: TestData[];
  };
}) => {
  const navigator = useNavigate();
  const onChange = (key: string | string[]) => {
    console.log(key);
  };

  const testDataList =
    props.status === 'all'
      ? Object.keys(props.statusDataList).reduce((res, status) => {
          res.push(...props.statusDataList[status]);
          return res;
        }, [] as TestData[])
      : props.statusDataList[props.status];
  const groupTestDataWithFileName =
    testDataList?.reduce(
      (res, next) => {
        if (!res[next.location.file]) {
          res[next.location.file] = [];
        }
        res[next.location.file].push(next);
        return res;
      },
      {} as {
        [fileName: string]: TestData[];
      },
    ) || {};

  const items: CollapseProps['items'] = Object.keys(
    groupTestDataWithFileName,
  ).map((fileName, key) => {
    return {
      key,
      label: fileName,
      children: groupTestDataWithFileName[fileName].map((testData, key) => {
        const timeMinutes = Math.floor(testData.duration / 1000 / 60);
        const timeSeconds = Math.floor((testData.duration / 1000) % 60);
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
          <div
            className={styeld['test-details']}
            // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={key}
            onClick={() => {
              navigator(`/report?dumpId=${testData.dumpPath.split('/').pop()}`);
            }}
          >
            <div className={styeld['test-info']}>
              <span className={styeld['test-name']}>
                {statusIcon(testData.status as TestStatus)}
                {testData.title}
              </span>
              <span>
                duration: {timeMinutes !== 0 && `${timeMinutes}m`}{' '}
                {timeSeconds && `${timeSeconds}s`}
              </span>
            </div>
            <div className={styeld['test-file-path']}>
              {testData.location.file}:{testData.location.line}
            </div>
          </div>
        );
      }),
    };
  });
  return (
    <Collapse
      className={styeld['test-result']}
      activeKey={[...Array(items.length).keys()]}
      items={items}
      onChange={onChange}
    />
  );
};

export const StatsNavView: React.FC<{
  stats: Stats;
  statusDataList: {
    [stats: string]: TestData[];
  };
}> = ({ stats, statusDataList }) => {
  // eslint-disable-next-line node/prefer-global/url-search-params
  const searchParams = new URLSearchParams(window.location.search);
  const navigate = useNavigate();
  const q = searchParams.get('status')?.toString() || '';
  const items: MenuItem[] = [
    {
      label: `All (${stats.total - stats.skipped})`,
      key: 'all',
    },
    {
      label: `Passed (${stats.passed})`,
      key: 'passed',
    },
    {
      label: `Failed (${stats.failed})`,
      key: 'failed',
      icon: statusIcon('failed'),
    },
    {
      label: `Flaky (${stats.flaky})`,
      key: 'flaky',
      icon: statusIcon('flaky'),
    },
    {
      label: `Skipped (${stats.skipped})`,
      key: 'skipped',
      icon: statusIcon('skipped'),
    },
  ];

  const [status, setStatus] = useState(q || 'all');

  const onClick: MenuProps['onClick'] = (e) => {
    navigate(`?status=${e.key}`);
    setStatus(e.key);
  };

  return (
    <>
      <div className={styeld.nav}>
        <Menu
          onClick={onClick}
          selectedKeys={[status]}
          mode="horizontal"
          items={items}
        />
      </div>
      <TestResult status={status} statusDataList={statusDataList} />
    </>
  );
};

export function Home() {
  const [testDataList, setTestDataJson] = useState<Array<TestData>>([]);
  const [isLoading, setLoading] = useState<any>(true);
  useEffect(() => {
    fetch('/public/test-data-list.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setTestDataJson(data['test-list']);
        console.log('data', data, data['test-list']); // 在此处处理 JSON 数据
      })
      .catch((error) => console.error('Error:', error))
      .finally(() => {
        setLoading(false);
      });
  }, []);

  function TestResultReport(props: { testDataList: TestData[] }) {
    const { testDataList } = props;
    const statusDataList = testDataList?.reduce(
      (res, next) => {
        res[next.status] = [...(res[next.status] || []), next];
        return res;
      },
      {} as {
        [stats: string]: Array<TestData>;
      },
    );
    console.log('statusDataList', testDataList, statusDataList);
    const total = testDataList.length;
    const passed = statusDataList.passed?.length || 0;
    const failed = statusDataList.failed?.length || 0;
    const flaky = statusDataList.flaky?.length || 0;
    const skipped = statusDataList.skipped?.length || 0;
    const ok = Boolean(total === passed);

    return (
      <div className={styeld.container}>
        <StatsNavView
          stats={{ total, passed, failed, flaky, skipped, ok }}
          statusDataList={statusDataList}
        />
      </div>
    );
  }
  return <>{!isLoading && <TestResultReport testDataList={testDataList} />}</>;
}
