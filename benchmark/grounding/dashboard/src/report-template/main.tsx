import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { MidsceneResultsFileData } from '../../../evaluation/midscene/types.js';
import { ReportApp } from './ReportApp';
import type { ReportData } from './report-types';
import { buildReportDataFromResultsFile } from './results-adapter';

const reportResultsPlaceholder = '__GROUNDING_RESULTS_DATA__';

function readEmbeddedResultsData(): MidsceneResultsFileData | null {
  const script = document.getElementById('report-results');
  if (!script) {
    return null;
  }

  const raw = script.textContent?.trim() ?? '';
  if (!raw || raw === reportResultsPlaceholder) {
    return null;
  }

  return JSON.parse(raw) as MidsceneResultsFileData;
}

async function loadLiveResultsData(): Promise<MidsceneResultsFileData> {
  const response = await fetch('./results.json', {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`读取 results.json 失败（HTTP ${response.status}）`);
  }

  return response.json() as Promise<MidsceneResultsFileData>;
}

function ReportBootstrap() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      return;
    }

    let cancelled = false;
    const embeddedResults = readEmbeddedResultsData();
    const sourcePromise = embeddedResults
      ? Promise.resolve(embeddedResults)
      : loadLiveResultsData();

    void sourcePromise
      .then((resultsFile) => buildReportDataFromResultsFile({ resultsFile }))
      .then((reportData) => {
        if (!cancelled) {
          setData(reportData);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) {
    return (
      <div
        style={{
          padding: '32px',
          fontFamily:
            '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          color: '#1f2937',
        }}
      >
        <h2 style={{ marginBottom: '12px' }}>报告加载失败</h2>
        <div>{error}</div>
        <div style={{ marginTop: '12px', color: '#6b7280' }}>
          请确认当前页面可以正常读取同目录的 `results.json`。
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          padding: '32px',
          fontFamily:
            '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
          color: '#1f2937',
        }}
      >
        正在加载报告数据...
      </div>
    );
  }

  return <ReportApp data={data} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ReportBootstrap />,
);
