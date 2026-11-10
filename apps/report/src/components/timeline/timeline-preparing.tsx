import { PictureOutlined } from '@ant-design/icons';

export function TimelinePreparing() {
  return (
    <output className="timeline-preparing" aria-live="polite">
      <span className="timeline-preparing-frames" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index}>
            <PictureOutlined />
          </span>
        ))}
      </span>
      <span className="timeline-preparing-label">
        <span className="timeline-preparing-spinner" aria-hidden="true" />
        Preparing screenshots…
      </span>
    </output>
  );
}
