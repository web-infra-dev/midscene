import { FolderOpenOutlined, SearchOutlined } from '@ant-design/icons';

export function OverviewEmptyState({
  title,
  description,
  onReset,
}: {
  title: string;
  description: string;
  onReset?: () => void;
}): JSX.Element {
  return (
    <div className="runner-overview-empty" aria-live="polite">
      <span className="runner-overview-empty-icon" aria-hidden="true">
        {onReset ? <SearchOutlined /> : <FolderOpenOutlined />}
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {onReset ? (
        <button
          type="button"
          className="runner-overview-empty-action"
          onClick={onReset}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
