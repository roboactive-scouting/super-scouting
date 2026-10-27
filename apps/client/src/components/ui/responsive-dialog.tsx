import { useIsDesktop } from '@/lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { Dialog, type DialogProps } from './dialog';
import { Sheet } from './sheet';

export type ResponsiveDialogProps = DialogProps & {
  /**
   * The ✕ on the phone sheet as well. Default false: the phone finals draw only the handle;
   * Switch competition asked for its ✕ (UI fix notes, Home 2). `showClose` is the desktop's.
   */
  sheetClose?: boolean;
  /** Drag the phone sheet down to dismiss it (UF.4). Default true. */
  dragToClose?: boolean;
};

/**
 * One surface, two shapes: the centred Dialog at 1024 px and wider, the bottom Sheet
 * below (THEME "Destructive confirmation": on a phone, the same content as a sheet).
 */
export function ResponsiveDialog({ sheetClose, dragToClose, ...props }: ResponsiveDialogProps) {
  const desktop = useIsDesktop();
  if (desktop) return <Dialog {...props} />;
  const {
    open,
    title,
    onClose,
    children,
    footer,
    initialFocus,
    dismissible,
    describedBy,
    icon,
    foot,
  } = props;
  return (
    <Sheet
      open={open}
      side="bottom"
      title={title}
      onClose={onClose}
      initialFocus={initialFocus}
      dismissible={dismissible}
      describedBy={describedBy}
      showClose={sheetClose}
      dragToClose={dragToClose}
      icon={icon}
      foot={foot}
    >
      {/* With a pinned foot, the foot carries the room below (its own top padding meets this). */}
      <div className={cn('flex flex-col gap-3', foot ? 'pb-3' : 'pb-4')}>
        {children}
        {footer && <div className="mt-2 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </Sheet>
  );
}
