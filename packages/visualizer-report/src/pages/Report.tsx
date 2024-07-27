import { Visualizer } from '@midscene/visualizer';
import React, { useEffect, useState } from 'react';

declare module '@midscene/visualizer' {
  export function Visualizer(dumpInfo: any): any;
}

export function Report() {
  const [dumpJson, setDumpJson] = useState<any>(null);
  const [isLoading, setLoading] = useState<any>(true);
  useEffect(() => {
    fetch('/latest.web-dump.json')
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
  }, []);
  return (
    <div className="container-box">
      <div>
        <main>{!isLoading && <Visualizer dump={dumpJson} />}</main>
        <div></div>
      </div>
    </div>
  );
}
