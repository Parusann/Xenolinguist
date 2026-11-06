import { useEffect, useRef, type ReactNode } from 'react';

export function Icon({ name }: { name: 'add' | 'arrow' | 'collection' | 'globe' | 'system' | 'download' }) {
  const paths = { add: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-6-6 6 6-6 6',
    collection: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h4', globe: 'M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
    system: 'M4 4h16v12H4zM8 20h8m-4-4v4', download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5' };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {name === 'globe' && <circle cx="12" cy="12" r="9" />}<path d={paths[name]} /></svg>;
}
export function Brand() { return <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true">χ</span><span>Xenolinguist<small>LANGUAGE ATLAS</small></span></a>; }
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={'notice' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>{children}</div>;
}
export function Modal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></div>{children}
  </dialog>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><span className="empty-glyph" aria-hidden="true">⟨ χ ⟩</span><h2>{title}</h2>{children}</div>;
}
