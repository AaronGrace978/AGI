import { memo, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  width?: number;
}

export const Modal = memo(function Modal({ open, onClose, title, children, actions, width }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="ui-modal__backdrop" onClick={onClose} role="presentation">
      <div
        className="ui-modal"
        style={width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        {title && (
          <div className="ui-modal__header">
            <h2 className="ui-modal__title">{title}</h2>
            <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
});
