import { Plus } from 'lucide-react';

interface SectionDividerProps {
  className?: string;
}

export function SectionDivider({ className = '' }: SectionDividerProps) {
  return (
    <div
      className={`home-section-divider ${className}`.trim()}
      aria-hidden="true"
    >
      <Plus className="home-section-divider__plus" strokeWidth={1} />
      <span className="home-section-divider__line" />
      <Plus className="home-section-divider__plus" strokeWidth={1} />
    </div>
  );
}
