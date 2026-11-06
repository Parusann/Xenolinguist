import { useEffect, useState } from 'react';
import { api, date, useResource, useTask } from './api.js';
import { Modal, Notice } from './ui.js';

type Connection = { id: string; label: string; created_at: string; expires_at: string };
export function DesktopConnections() {
  const devices = useResource<Connection[]>('/api/desktop/connections'), [review, setReview] = useState(false);
  const [grant, setGrant] = useState<{ code: string; expiresAt: string } | null>(null), task = useTask();
  useEffect(() => {
    if (!grant) return;
    const timer = setTimeout(() => setGrant(null), Math.max(0, new Date(grant.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [grant]);
  return <section className="panel source-section"><div className="section-heading"><div><p className="eyebrow">EXPLICITLY CONNECTED</p><h2>Desktop connections</h2></div><button onClick={() => setReview(true)}>Connect a desktop</button></div>
    <p>The desktop keeps its credential encrypted for your operating-system account. Connecting does not upload a project. Choose evidence and review its scope in the workbench before any transfer.</p>
    {devices.data?.length === 0 && <p className="muted">No active desktop connections.</p>}
    {devices.data?.map(device => <div className="section-heading" key={device.id}><div><strong>{device.label}</strong><p className="form-help">Connected {date(device.created_at)} · expires {date(device.expires_at)}</p></div>
      <button disabled={task.busy} onClick={() => void task.run(async () => { await api('/api/desktop/connections/' + device.id, 'DELETE'); devices.reload(); })}>Revoke connection</button></div>)}
    {(devices.error || task.error) && <Notice error>{devices.error || task.error}</Notice>}
    {review && <Modal title="Authorize a desktop connection" busy={task.busy} onClose={() => { setReview(false); setGrant(null); devices.reload(); }}>
      <p>This connection can access your private datasets, upload selected wordlists, run comparisons and retrieve your reports. Publication, cross-user sharing and training remain off.</p>
      {grant ? <><label>One-time desktop connection code<input readOnly value={grant.code} onFocus={event => event.currentTarget.select()} spellCheck={false} /></label>
        <p className="form-help">Copy this code into the Atlas area of Xenolinguist. It expires in two minutes and can be used once. Your account password stays in this browser.</p>
        <button onClick={() => { setReview(false); setGrant(null); devices.reload(); }}>Done</button></> :
        <button className="primary" disabled={task.busy} onClick={() => void task.run(async () => setGrant(await api('/api/desktop/grants', 'POST', { label: 'Xenolinguist desktop' })))}>{task.busy ? 'Creating code…' : 'Authorize and generate code'}</button>}
      {task.error && <Notice error>{task.error}</Notice>}
    </Modal>}
  </section>;
}
