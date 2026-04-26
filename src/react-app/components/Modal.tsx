import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-sm mx-4 sm:max-w-md sm:mx-0',
  md: 'max-w-md mx-4 sm:max-w-lg sm:mx-0',
  lg: 'max-w-lg mx-4 sm:max-w-xl lg:max-w-2xl sm:mx-0',
};

export default function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-on-surface/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={`bg-surface-container-lowest rounded-card shadow-ambient-3 w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden`}>
        <div className="flex items-center justify-between p-md sm:p-lg border-b border-surface-variant">
          <h2 id="modal-title" className="text-h3 text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-md sm:p-lg overflow-y-auto max-h-[calc(90vh-120px)]">
          {children}
        </div>
      </div>
    </div>
  );
}
