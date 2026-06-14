import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type TooltipPlacement = 'top' | 'bottom';

interface TooltipPosition {
  top: number;
  left: number;
  arrowLeft: number;
  placement: TooltipPlacement;
}

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  tooltipClassName?: string;
  placement?: TooltipPlacement;
  focusable?: boolean;
  disabled?: boolean;
}

export function Tooltip({
  children,
  content,
  className = '',
  tooltipClassName = '',
  placement = 'top',
  focusable = true,
  disabled = false,
}: TooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const hasContent = content != null && content !== false;

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const show = useCallback(() => {
    if (!disabled && hasContent) {
      setOpen(true);
    }
  }, [disabled, hasContent]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const viewportPadding = 8;
    const gap = 10;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    let resolvedPlacement = placement;

    if (placement === 'top' && triggerRect.top < tooltipRect.height + gap + viewportPadding) {
      resolvedPlacement = 'bottom';
    } else if (
      placement === 'bottom' &&
      window.innerHeight - triggerRect.bottom < tooltipRect.height + gap + viewportPadding
    ) {
      resolvedPlacement = 'top';
    }

    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const unclampedLeft = triggerCenter - tooltipRect.width / 2;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - tooltipRect.width - viewportPadding);
    const left = Math.min(
      Math.max(viewportPadding, unclampedLeft),
      maxLeft,
    );
    const unclampedTop =
      resolvedPlacement === 'top'
        ? triggerRect.top - tooltipRect.height - gap
        : triggerRect.bottom + gap;
    const maxTop = Math.max(viewportPadding, window.innerHeight - tooltipRect.height - viewportPadding);
    const top = Math.min(Math.max(viewportPadding, unclampedTop), maxTop);
    const arrowLeft = Math.min(Math.max(10, triggerCenter - left), tooltipRect.width - 10);

    setPosition({
      top,
      left,
      arrowLeft,
      placement: resolvedPlacement,
    });
  }, [placement]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, content, updatePosition]);

  useEffect(() => {
    if (!open) return;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        aria-describedby={open ? tooltipId : undefined}
        tabIndex={focusable ? 0 : undefined}
        onMouseEnter={show}
        onMouseLeave={close}
        onFocus={show}
        onBlur={close}
        className={`inline-flex cursor-help rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 ${className}`}
      >
        {children}
      </span>
      {open &&
        hasContent &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={{
              top: position?.top ?? -9999,
              left: position?.left ?? -9999,
              visibility: position ? 'visible' : 'hidden',
            }}
            className={`pointer-events-none fixed z-[100] max-w-[18rem] rounded-md bg-gray-950 px-3 py-2 text-xs font-medium leading-snug text-white shadow-lg ${tooltipClassName}`}
          >
            {content}
            <span
              style={{ left: position?.arrowLeft ?? '50%' }}
              className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-950 ${
                position?.placement === 'bottom' ? '-top-1' : '-bottom-1'
              }`}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
