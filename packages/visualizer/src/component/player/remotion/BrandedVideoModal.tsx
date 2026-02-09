import { DownloadOutlined } from '@ant-design/icons';
import { Player } from '@remotion/player';
import { Button, Modal, Progress, message } from 'antd';
import { useMemo, useState } from 'react';
import type { AnimationScript } from '../../../utils/replay-scripts';
import { BrandedComposition } from './BrandedComposition';
import { exportBrandedVideo } from './export-branded-video';
import { calculateFrameMap } from './frame-calculator';

export const BrandedVideoModal: React.FC<{
  open: boolean;
  onClose: () => void;
  scripts: AnimationScript[];
}> = ({ open, onClose, scripts }) => {
  const frameMap = useMemo(() => calculateFrameMap(scripts), [scripts]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    try {
      await exportBrandedVideo(frameMap, (pct) =>
        setProgress(Math.round(pct * 100)),
      );
      message.success('Video exported');
    } catch (e) {
      console.error('Export failed:', e);
      message.error('Export failed');
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={exporting ? undefined : onClose}
      centered
      destroyOnClose
      footer={null}
      width={Math.min(960, window.innerWidth - 80)}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ padding: '24px 0 0' }}>
        <Player
          component={BrandedComposition}
          inputProps={{ frameMap, scripts }}
          durationInFrames={frameMap.totalDurationInFrames}
          compositionWidth={960}
          compositionHeight={540}
          fps={frameMap.fps}
          controls
          autoPlay
          style={{
            width: '100%',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 0',
          }}
        >
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
          >
            {exporting ? 'Exporting…' : 'Download Video'}
          </Button>
          {exporting && (
            <Progress
              percent={progress}
              size="small"
              style={{ flex: 1, marginBottom: 0 }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
