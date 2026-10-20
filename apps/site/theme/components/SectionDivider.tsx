interface SectionDividerProps {
  className?: string;
}

export function SectionDivider({ className = '' }: SectionDividerProps) {
  return (
    <div
      className={`home-section-divider ${className}`.trim()}
      aria-hidden="true"
    >
      <img
        className="home-section-divider__asset home-section-divider__asset--light"
        src="/images/backgrounds/section-divider-light.svg"
        alt=""
      />
      <img
        className="home-section-divider__asset home-section-divider__asset--dark"
        src="/images/backgrounds/section-divider-dark.svg"
        alt=""
      />
    </div>
  );
}
