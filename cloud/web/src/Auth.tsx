import { useState } from 'react';
import { api, useTask, type User } from './api.js';
import { Brand, Icon, Notice } from './ui.js';

export function Auth({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [register, setRegister] = useState(false), task = useTask();
  return <div className="auth-shell"><section className="auth-story"><Brand /><div className="auth-copy"><p className="eyebrow">A FIELD GUIDE TO THE UNKNOWN</p>
    <h1>Every language<br />leaves a pattern.</h1><p>Collect the evidence. Compare the possibilities.<br />Find the next question worth asking.</p>
    <div className="specimen" aria-label="Example of a conditional symbol correspondence"><span>OBSERVE</span><code>p a t&nbsp;&nbsp; → &nbsp;&nbsp;φ α τ</code><span>COMPARE · TEST · REVISE</span></div>
    </div><p className="auth-foot">Private by default. Grounded in sources. Built for discovery.</p></section>
    <main className="auth-panel"><div><p className="eyebrow">YOUR RESEARCH, CONNECTED</p><h2>{register ? 'Create your account' : 'Welcome to Atlas'}</h2>
      <p className="muted">A personal workspace for language evidence and careful comparison.</p>
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void task.run(async () => {
        const data = await api<{ user: User }>('/api/auth/' + (register ? 'sign-up/email' : 'sign-in/email'), 'POST', {
          email: form.get('email'), password: form.get('password'), ...(register ? { name: form.get('name') } : {}) }); onSignedIn(data.user);
      }); }}>
        {register && <label>Your name<input name="name" required maxLength={100} autoComplete="name" /></label>}
        <label>Email<input type="email" name="email" required autoComplete="email" /></label>
        <label>Password<input type="password" name="password" required minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
        {register && <p className="form-help">Use at least 12 characters. Accounts and evidence are stored on this local Atlas server.</p>}
        {task.error && <Notice error>{task.error}</Notice>}
        <button className="primary full" disabled={task.busy}>{task.busy ? 'Please wait…' : register ? 'Create private account' : 'Sign in'}<Icon name="arrow" /></button>
      </form><button className="text-button" onClick={() => setRegister(!register)}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      <div className="local-note"><span className="status-dot" /> LOCAL PERSONAL BETA<p>The server is available while its host computer is on. Uploads are private and excluded from model training.</p></div>
    </div></main></div>;
}
