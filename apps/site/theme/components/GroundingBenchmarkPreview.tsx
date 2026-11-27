import type { ReactNode } from 'react';

export function GroundingBenchmarkReportLink({
  children,
}: { children: ReactNode }) {
  return (
    <a
      className="rp-link"
      href={__MIDSCENE_GROUNDING_REPORT_URL__}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

export function GroundingBenchmarkPreview({ title }: { title: string }) {
  if (!__MIDSCENE_GROUNDING_BRIEF_URL__) return null;

  return (
    <iframe
      src={__MIDSCENE_GROUNDING_BRIEF_URL__}
      title={title}
      loading="lazy"
      style={{
        display: 'block',
        width: 'calc(100% - 15px)',
        height: 'calc(clamp(600px, 80vh, 760px) - 65px)',
        border: '1px solid var(--rp-c-divider, #d8dee8)',
        borderRadius: 8,
      }}
    />
  );
}
