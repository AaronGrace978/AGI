import { memo } from 'react';

export type StatusDotStatus = 'online' | 'processing' | 'offline';

interface StatusDotProps {
  status: StatusDotStatus;
  size?: number;
  label?: string;
  className?: string;
}

function statusClass(status: StatusDotStatus): string {
  if (status === 'processing') return 'ui-status-dot processing';
  if (status === 'offline') return 'ui-status-dot offline';
  return 'ui-status-dot';
}

export const StatusDot = memo(function StatusDot({ status, size, label, className }: StatusDotProps) {
  const sizeStyle = size ? { width: size, height: size } : undefined;
  return (
    <span className={`ui-status-wrap ${className || ''}`}>
      <span className={statusClass(status)} style={sizeStyle} />
      {label && <span className="ui-status-label">{label}</span>}
    </span>
  );
});
