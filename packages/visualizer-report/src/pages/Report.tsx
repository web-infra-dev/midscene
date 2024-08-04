import { Visualizer } from '@midscene/visualizer';
import { useNavigate } from '@modern-js/runtime/router';
import React, { useEffect, useState } from 'react';

declare module '@midscene/visualizer' {
  export function Visualizer(dumpInfo: any): any;
}

export function Report() {
  const navigation = useNavigate();
  const [dumpJson, setDumpJson] = useState<any>(null);
  const [isLoading, setLoading] = useState<any>(true);
  // eslint-disable-next-line node/prefer-global/url-search-params
  const searchParams = new URLSearchParams(window.location.search);
  const dumpId = searchParams.get('dumpId')?.toString() || '';

  useEffect(() => {
    fetch(`/public/${dumpId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setDumpJson(data);
        console.log('data', data); // 在此处处理 JSON 数据
      })
      .catch((error) => console.error('Error:', error))
      .finally(() => {
        setLoading(false);
      });
  }, [dumpId]);
  return (
    <div className="container-box">
      <div>
        <main>
          {!isLoading && (
            <Visualizer
              dump={dumpJson}
              logoAction={() => {
                navigation('/');
              }}
            />
          )}
        </main>
        <div />
      </div>
    </div>
  );
}
