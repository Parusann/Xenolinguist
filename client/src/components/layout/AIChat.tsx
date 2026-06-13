import { useState, useRef, useEffect, useCallback } from 'react'
import { streamAI } from '@/services/api'
import { useOllama } from '@/stores/ollama-context'
import { useProfile } from '@/stores/profile-context'
import {
  SYSTEM_PROMPTS,
  formatDictionaryForPrompt,
  formatGrammarForPrompt,
  formatSamplesForPrompt,
} from 'shared/prompts'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const QUICK_ACTIONS = ['Suggest 5 new words', "What's my next move?", 'Find inconsistencies']

let msgId = 0
function nextId() {
  return `msg-${Date.now()}-${++msgId}`
}

export function AIChat({ onClose }: { onClose: () => void }) {
  const { selectedModel, connected } = useOllama()
  const { profile } = useProfile()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Abort any in-flight stream when the panel closes/unmounts so it doesn't keep running server-side.
  useEffect(() => () => abortRef.current?.abort(), [])

  const buildSystemPrompt = useCallback((): string => {
    const parts: string[] = [SYSTEM_PROMPTS.patternAnalysis]
    if (profile) {
      if (profile.dictionary.length > 0) parts.push(`\n\nCURRENT DICTIONARY (${profile.dictionary.length} words):\n${formatDictionaryForPrompt(profile.dictionary)}`)
      if (profile.grammar_rules.length > 0) parts.push(`\n\nGRAMMAR RULES (${profile.grammar_rules.length} rules):\n${formatGrammarForPrompt(profile.grammar_rules)}`)
      if (profile.samples.length > 0) parts.push(`\n\nSAMPLES (${profile.samples.length} total):\n${formatSamplesForPrompt(profile.samples)}`)
    }
    return parts.join('')
  }, [profile])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || !connected) return
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text.trim(), timestamp: new Date() }
    const assistantMsg: ChatMessage = { id: nextId(), role: 'assistant', content: '', timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    const allMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
    try {
      await streamAI(allMessages, { system: buildSystemPrompt(), model: selectedModel, signal: controller.signal }, (token: string) => {
        if (controller.signal.aborted) return
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') updated[updated.length - 1] = { ...last, content: last.content + token }
          return updated
        })
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((prev) => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') updated[updated.length - 1] = { ...last, content: last.content || `Error: ${err instanceof Error ? err.message : 'Stream failed'}` }
          return updated
        })
      }
    } finally {
      setStreaming(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [streaming, connected, messages, buildSystemPrompt, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const lastMsg = messages[messages.length - 1]
  const showThinking = streaming && lastMsg?.role === 'assistant' && !lastMsg.content
  const ctxChips = profile
    ? [`${profile.dictionary.length} words`, `${profile.grammar_rules.length} rules`, `${profile.samples.length} samples`, ...(profile.number_system.base ? [`base ${profile.number_system.base}`] : [])]
    : []

  return (
    <div className="side-panel">
      {/* Header */}
      <div className="flex" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <span className="dot" style={{ background: 'var(--ai)', boxShadow: '0 0 6px var(--ai)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 500 }}>Decoder AI</span>
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-mute)', marginLeft: 6 }}>{connected ? `${selectedModel || 'ollama'} · local` : 'offline'}</span>
        </div>
        <div className="flex-1" />
        <button className="btn xs ghost" onClick={onClose} title="Close (Shift+A)">✕</button>
      </div>

      {/* Context chips */}
      {ctxChips.length > 0 && (
        <div className="flex" style={{ gap: 4, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="font-mono" style={{ fontSize: 10, color: 'var(--fg-faint)', marginRight: 4 }}>CTX</span>
          {ctxChips.map((c) => <span key={c} className="badge" style={{ fontSize: 9.5 }}>{c}</span>)}
        </div>
      )}

      {/* Thread */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div className="dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
            Ask the decoder about patterns, vocabulary, or grammar in your language data.
            {!connected && <div style={{ color: 'var(--conf-unknown)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 8 }}>Ollama offline — connect to chat.</div>}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="slide-up flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: m.role === 'user' ? '10px 14px' : '12px 14px',
              borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: m.role === 'user' ? 'rgba(0,230,118,0.10)' : 'var(--bg-inner)',
              border: '1px solid ' + (m.role === 'user' ? 'rgba(0,230,118,0.25)' : 'var(--border)'),
              fontSize: 13, lineHeight: 1.55, color: 'var(--fg-1)',
              fontFamily: m.role === 'assistant' ? 'var(--font-mono)' : 'var(--font-sans)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.role === 'assistant' && (
                <div style={{ marginBottom: 6 }}>
                  <span className="font-mono" style={{ fontSize: 9, color: 'var(--ai)', letterSpacing: '0.12em' }}>DECODER AI</span>
                </div>
              )}
              {m.content}
              {m.role === 'assistant' && streaming && m === lastMsg && m.content && (
                <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--accent)', opacity: 0.6, marginLeft: 2, verticalAlign: 'text-bottom' }} className="pulse-soft" />
              )}
            </div>
          </div>
        ))}
        {showThinking && (
          <div className="flex fade-in" style={{ gap: 8, paddingLeft: 14, alignItems: 'center' }}>
            <span className="dot pulse-soft" style={{ background: 'var(--ai)' }} />
            <span className="shimmer-text" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>thinking…</span>
          </div>
        )}
      </div>

      {/* Footer: quick actions + input */}
      <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map((s) => (
            <button key={s} className="btn xs ghost" onClick={() => sendMessage(s)} disabled={!connected || streaming} style={{ fontSize: 11 }}>{s}</button>
          ))}
        </div>
        <div className="flex" style={{ gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? 'Ask the decoder…' : 'Ollama offline'}
            disabled={!connected || streaming}
            rows={1}
            className="textarea"
            style={{ flex: 1, minHeight: 38, maxHeight: 120, resize: 'none' }}
          />
          <button className="btn primary sm" onClick={() => sendMessage(input)} disabled={!input.trim() || !connected || streaming} style={{ alignSelf: 'stretch' }}>{streaming ? '…' : '↵'}</button>
        </div>
      </div>
    </div>
  )
}
