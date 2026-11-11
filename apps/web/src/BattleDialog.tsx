import { useEffect, useRef, type ReactNode } from 'react';

export function BattleDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const backdrop = root.current?.parentElement;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop && !element.classList.contains('battle-motion-layer'));
    const oldInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    root.current?.focus();
    return () => { siblings.forEach((element, index) => { element.inert = oldInert[index] ?? false; }); previous?.focus(); };
  }, []);
  return <div className="battle-dialog-backdrop"><section ref={root} tabIndex={-1} className="battle-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose?.();
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, [tabindex="0"]'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root.current)) { event.preventDefault(); first?.focus(); }
  }}><header><h2>{title}</h2>{onClose && <button type="button" onClick={onClose} aria-label="关闭选择">×</button>}</header>{children}</section></div>;
}
