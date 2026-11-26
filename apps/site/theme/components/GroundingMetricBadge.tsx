import accuracyBadge from '../../../../packages/cli/src/benchmark-grounding/ui/assets/accuracy.svg?inline';
import balanceBadge from '../../../../packages/cli/src/benchmark-grounding/ui/assets/balance.svg?inline';
import economyBadge from '../../../../packages/cli/src/benchmark-grounding/ui/assets/economy.svg?inline';
import performanceBadge from '../../../../packages/cli/src/benchmark-grounding/ui/assets/performance.svg?inline';

const badges = {
  accuracy: accuracyBadge,
  performance: performanceBadge,
  economy: economyBadge,
  balance: balanceBadge,
};

export function GroundingTableLabel({
  children,
  icon,
}: { children: string; icon?: string }) {
  if (import.meta.env.SSG_MD || !icon) return children;

  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <img
        src={icon}
        alt=""
        className="no-zoom"
        width={20}
        height={20}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          marginInlineEnd: 6,
        }}
      />
      {children}
    </span>
  );
}

export function GroundingMetricBadge({
  children,
  metric,
}: { children: string; metric: keyof typeof badges }) {
  return (
    <GroundingTableLabel icon={badges[metric]}>{children}</GroundingTableLabel>
  );
}
