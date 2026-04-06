import { useState, useEffect, useCallback, useRef } from 'react'

interface TourStep {
  id: string
  title: string
  description: string
  selector?: string
}

interface OnboardingTourProps {
  onComplete: () => void
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: "Welcome to Xenolinguist. Let's walk through the decoding workflow.",
  },
  {
    id: 'samples',
    title: 'Samples',
    description: 'Start by inputting samples of the unknown language. Audio recording and language detection are supported.',
    selector: '[data-tour="samples"]',
  },
  {
    id: 'numbers',
    title: 'Numbers',
    description: "Map the number system first — it's always step one in first-contact linguistics.",
    selector: '[data-tour="numbers"]',
  },
  {
    id: 'vocabulary',
    title: 'Vocabulary',
    description: 'Build your dictionary word by word. AI can suggest meanings based on context.',
    selector: '[data-tour="vocabulary"]',
  },
  {
    id: 'grammar',
    title: 'Grammar',
    description: 'Once you have enough words, analyze grammar patterns and sentence structure.',
    selector: '[data-tour="grammar"]',
  },
  {
    id: 'translation',
    title: 'Translation',
    description: 'Live translate using your dictionary. Click any word to inspect or correct it.',
    selector: '[data-tour="translation"]',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Track your progress and export your language profile.',
    selector: '[data-tour="dashboard"]',
  },
  {
    id: 'ai-chat',
    title: 'AI Chat',
    description: 'Press Shift+A anytime to chat with AI about the language. Press Ctrl+K to search everything. Press ? for keyboard shortcuts.',
  },
  {
    id: 'ready',
    title: 'Ready',
    description: "You're ready to start decoding. Happy translating!",
  },
]

const STORAGE_KEY = 'xenolinguist-tour-completed'

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [animating, setAnimating] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const step = TOUR_STEPS[currentStep]
  const totalSteps = TOUR_STEPS.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  const measureTarget = useCallback(() => {
    if (!step.selector) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(step.selector)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [step.selector])

  useEffect(() => {
    measureTarget()
    window.addEventListener('resize', measureTarget)
    return () => window.removeEventListener('resize', measureTarget)
  }, [measureTarget])

  const transition = useCallback((next: number) => {
    setAnimating(true)
    setTimeout(() => {
      setCurrentStep(next)
      setAnimating(false)
    }, 150)
  }, [])

  const handleNext = useCallback(() => {
    if (isLast) {
      localStorage.setItem(STORAGE_KEY, 'true')
      onComplete()
    } else {
      transition(currentStep + 1)
    }
  }, [isLast, currentStep, onComplete, transition])

  const handleBack = useCallback(() => {
    if (!isFirst) {
      transition(currentStep - 1)
    }
  }, [isFirst, currentStep, transition])

  const handleSkip = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    onComplete()
  }, [onComplete])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSkip])

  // Compute card position: near the highlighted element or centered
  const getCardStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }
    }

    const padding = 16
    const cardWidth = 360
    const cardHeight = 220

    // Position to the right of the target element by default
    let left = targetRect.right + padding
    let top = targetRect.top + targetRect.height / 2 - cardHeight / 2

    // If card would overflow right, position to the left
    if (left + cardWidth > window.innerWidth - padding) {
      left = targetRect.left - cardWidth - padding
    }

    // If card would overflow left, position below
    if (left < padding) {
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2
      top = targetRect.bottom + padding
    }

    // Clamp vertical position
    top = Math.max(padding, Math.min(top, window.innerHeight - cardHeight - padding))
    left = Math.max(padding, Math.min(left, window.innerWidth - cardWidth - padding))

    return {
      position: 'fixed',
      top,
      left,
      width: cardWidth,
    }
  }

  return (
    <div className="fixed inset-0 z-[9999]" style={{ backdropFilter: 'blur(4px)' }}>
      {/* Dark backdrop with cutout for highlighted element */}
      {targetRect ? (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx={10}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.7)"
            mask="url(#tour-mask)"
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        />
      )}

      {/* Glowing ring around highlighted element */}
      {targetRect && (
        <div
          className="absolute border-2 border-accent rounded-[10px] glow-accent pointer-events-none"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.3), inset 0 0 20px rgba(0, 255, 136, 0.05)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Explanation card */}
      <div
        ref={cardRef}
        className={`glass-card rounded-2xl p-6 max-w-[360px] border border-border shadow-2xl ${
          animating ? 'opacity-0 scale-95' : 'animate-fade-in opacity-100 scale-100'
        }`}
        style={{
          ...getCardStyle(),
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          zIndex: 10000,
        }}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono text-gray-500">
            {currentStep + 1} of {totalSteps}
          </span>
          <span className="text-[11px] font-mono text-accent/60">{step.title}</span>
        </div>

        {/* Welcome step logo */}
        {step.id === 'welcome' && (
          <div className="flex items-center justify-center mb-4">
            <span className="text-accent font-mono font-bold text-4xl text-glow">X</span>
          </div>
        )}

        {/* Ready step icon */}
        {step.id === 'ready' && (
          <div className="flex items-center justify-center mb-4">
            <span className="text-accent font-mono font-bold text-3xl text-glow">{'{ }'}</span>
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-gray-300 leading-relaxed mb-5">
          {step.description}
        </p>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button className="btn-ghost text-xs px-3 py-1.5" onClick={handleBack}>
                Back
              </button>
            )}
            <button className="btn-ghost text-xs px-3 py-1.5" onClick={handleSkip}>
              Skip Tour
            </button>
          </div>
          <button className="btn-primary text-xs px-4 py-1.5" onClick={handleNext}>
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-4 h-1.5 bg-accent glow-accent'
                  : i < currentStep
                    ? 'w-1.5 h-1.5 bg-accent/40'
                    : 'w-1.5 h-1.5 bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
