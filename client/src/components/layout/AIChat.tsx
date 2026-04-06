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

const SUGGESTED_PROMPTS = [
  'What patterns do you see?',
  'Suggest meanings for unknown words',
  'Analyze the grammar',
]

let msgId = 0
function nextId() {
  return `msg-${Date.now()}-${++msgId}`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AIChat({ onClose }: { onClose: () => void }) {
  const { selectedModel, connected } = useOllama()
  const { profile } = useProfile()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const buildSystemPrompt = useCallback((): string => {
    const parts = [SYSTEM_PROMPTS.patternAnalysis]

    if (profile) {
      if (profile.dictionary.length > 0) {
        parts.push(`\n\nCURRENT DICTIONARY (${profile.dictionary.length} words):\n${formatDictionaryForPrompt(profile.dictionary)}`)
      }
      if (profile.grammar_rules.length > 0) {
        parts.push(`\n\nGRAMMAR RULES (${profile.grammar_rules.length} rules):\n${formatGrammarForPrompt(profile.grammar_rules)}`)
      }
      if (profile.samples.length > 0) {
        parts.push(`\n\nSAMPLES (${profile.samples.length} total):\n${formatSamplesForPrompt(profile.samples)}`)
      }
    }

    return parts.join('')
  }, [profile])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || !connected) return

    const userMsg: ChatMessage = {
      id: nextId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }

    const assistantMsg: ChatMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)
    abortRef.current = false

    const allMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      await streamAI(
        allMessages,
        { system: buildSystemPrompt(), model: selectedModel },
        (token: string) => {
          if (abortRef.current) return
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last && last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + token }
            }
            return updated
          })
        },
      )
    } catch (err) {
      if (!abortRef.current) {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || `Error: ${err instanceof Error ? err.message : 'Stream failed'}`,
            }
          }
          return updated
        })
      }
    } finally {
      setStreaming(false)
    }
  }, [streaming, connected, messages, buildSystemPrompt, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="fixed right-0 top-10 bottom-6 w-96 glass border-l border-border z-30 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">AI Assistant</span>
          {selectedModel && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/[0.1] text-accent/80">
              {selectedModel.split(':')[0]}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="btn-ghost text-gray-500 hover:text-gray-300 w-6 h-6 flex items-center justify-center text-sm"
          title="Close chat"
        >
          &times;
        </button>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
            <div className="text-gray-600 text-sm text-center">
              Ask the AI about patterns, vocabulary, or grammar in your language data.
            </div>
            <div className="flex flex-col gap-2 w-full">
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={!connected || streaming}
                  className="glass-card px-3 py-2 text-left text-accent text-[13px] hover:border-accent/30 transition-colors disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
            {!connected && (
              <div className="text-red-400/70 text-[11px] font-mono">
                Ollama offline — connect to chat
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}
          >
            <div
              className={`rounded-lg px-3 py-2 max-w-[80%] ${
                msg.role === 'user'
                  ? 'ml-auto bg-accent/[0.08] text-gray-200 text-[13px]'
                  : 'mr-auto glass-inner text-gray-300 font-mono text-[13px]'
              }`}
            >
              <span className="whitespace-pre-wrap break-words">{msg.content}</span>
              {msg.role === 'assistant' && streaming && msg === messages[messages.length - 1] && !msg.content && (
                <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5" />
              )}
            </div>
            <span className="text-[10px] font-mono text-gray-700 mt-1 px-1">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="glass-inner border-t border-border px-3 py-2 flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? 'Ask about the language...' : 'Ollama offline'}
            disabled={!connected || streaming}
            rows={2}
            className="input flex-1 resize-none text-[13px]"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !connected || streaming}
            className="btn-primary px-3 self-end h-8 text-[12px] flex-shrink-0"
          >
            {streaming ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
