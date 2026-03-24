import { memo, type ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  glow?: 'green' | 'cyan' | 'magenta' | 'purple' | 'gold' | 'none';
  compact?: boolean;
}

export const Card = memo(function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  glow = 'none',
  compact,
}: CardProps) {
  const cls = [
    'ui-card',
    glow !== 'none' ? `ui-card--glow-${glow}` : '',
    compact ? 'ui-card--compact' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls}>
      {(title || actions) && (
        <div className="ui-card__header">
          <div className="ui-card__titles">
            {title && <h3 className="ui-card__title">{title}</h3>}
            {subtitle && <span className="ui-card__subtitle">{subtitle}</span>}
          </div>
          {actions && <div className="ui-card__actions">{actions}</div>}
        </div>
      )}
      <div className="ui-card__body">{children}</div>
    </div>
  );
});
