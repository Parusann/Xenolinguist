import { useState, useRef, useEffect } from 'react'
import { streamAI } from '@/services/api'
import { useOllama } from '@/stores/ollama-context'
import { useProfile } from '@/stores/profile-context'
import { saveAIRecords } from '@/stores/ai-history'
import { getSaveQueue } from '@/stores/save-runtime'
import { retainAIHistory, type AIRecord } from 'shared/schemas/ai-history'
import { SYSTEM_PROMPTS, formatDictionaryForPrompt, formatGrammarForPrompt, formatSamplesForPrompt } from 'shared/prompts'

const QUICK_ACTIONS = ['Suggest 5 new words', "What's my next move?", 'Find inconsistencies']
export function AIChat({ onClose }: { onClose: () => void }) {
  const { selectedModel, ready } = useOllama(), { profile } = useProfile()
  const [messages, setMessages] = useState<AIRecord[]>(() => profile?.ai_history ?? [])
  const [input, setInput] = useState(''), [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null), abortRef = useRef<AbortController | null>(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])
  useEffect(() => () => abortRef.current?.abort(), [])
  const removeHistory = () => {
    if (!profile || streaming) return
    const queue = getSaveQueue(), current = queue.view(profile.id)
    if (current) queue.edit(current, { ...current, ai_history: [] })
    setMessages([])
  }
  const send = async (text: string) => {
    if (!text.trim() || streaming || !ready || !profile) return
    const profileId = profile.id, controller = new AbortController(); abortRef.current = controller
    const user: AIRecord = { id: crypto.randomUUID(), role: 'user', content: text.trim(), timestamp: new Date().toISOString(), state: 'complete', task: 'chat' }
    const reply: AIRecord = { id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: user.timestamp, model: selectedModel, state: 'partial', task: 'chat' }
    const history = retainAIHistory([...messages, user])
    const render = () => setMessages(retainAIHistory([...history, { ...reply }]))
    const persist = () => saveAIRecords(profileId, [user, { ...reply }])
    render(); persist(); setInput(''); setStreaming(true)
    let lastSaved = Date.now()
    try {
      const system = [SYSTEM_PROMPTS.patternAnalysis, formatDictionaryForPrompt(profile.dictionary), formatGrammarForPrompt(profile.grammar_rules), formatSamplesForPrompt(profile.samples)].join('\n\n')
      await streamAI(history.filter(message => message.task === 'chat' && message.content).map(({ role, content }) => ({ role, content })), { task: 'chat', system, model: selectedModel, signal: controller.signal }, token => {
        reply.content += token; render()
        if (Date.now() - lastSaved > 1000) { persist(); lastSaved = Date.now() }
      })
      reply.state = 'complete'
    } catch (failure) {
      reply.state = controller.signal.aborted ? 'cancelled' : 'failed'
      reply.error = (controller.signal.aborted ? 'Cancelled; partial answer retained' : (failure as Error).message).slice(0, 500)
    } finally { render(); persist(); setStreaming(false); if (abortRef.current === controller) abortRef.current = null }
  }
  return <div className="side-panel" aria-label="Decoder AI">
    <div className="flex" style={{ padding: 16, gap: 10, borderBottom: '1px solid var(--border)' }}><b>Decoder AI</b><span className="dim">{ready ? selectedModel : 'Chat not ready'}</span><div className="flex-1" /><button className="btn xs" onClick={onClose}>Close chat</button></div>
    <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 18 }}>
      <p className="dim">Suggestions are unverified proposals. History stays with this profile; up to 40 records and 120,000 characters are retained. Use Runtime & setup to configure models and inspect jobs.</p>
      {!ready && <p role="status">Select an installed local chat model in Runtime & setup.</p>}
      {messages.map(message => <article key={message.id} style={{ marginBottom: 16, padding: 12, background: 'var(--bg-inner)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div className="dim">{message.role === 'user' ? 'You' : 'AI proposal'}{message.task && message.task !== 'chat' ? ' · ' + message.task : ''}{message.model ? ' · ' + message.model : ''}</div>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.content || (streaming ? 'Waiting for the model…' : 'No output retained')}</p>
        {message.state !== 'complete' && <p role="status">{message.error || (streaming ? 'In progress' : 'Interrupted; partial output retained')}</p>}
      </article>)}
    </div>
    <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
      <div className="flex" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{QUICK_ACTIONS.map(action => <button key={action} className="btn xs" disabled={!ready || streaming} onClick={() => void send(action)}>{action}</button>)}</div>
      <textarea className="textarea" aria-label="Chat message" placeholder="Ask the decoder…" value={input} maxLength={12000} disabled={streaming || !ready} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input) } }} />
      <div className="flex" style={{ gap: 8, marginTop: 8 }}><button className="btn primary sm" disabled={!ready || streaming || !input.trim()} onClick={() => void send(input)}>Send</button>{streaming && <button className="btn sm" onClick={() => abortRef.current?.abort()}>Stop generation</button>}<button className="btn sm" disabled={streaming || !messages.length} onClick={removeHistory}>Delete AI history</button></div>
    </div>
  </div>
}
