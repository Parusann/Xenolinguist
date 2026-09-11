import { useCallback, useRef, useState, type SetStateAction } from 'react'
import { useProfile } from '@/stores/profile-context'

/** Components remount when the profile or phase changes; their text lives in the durable profile draft. */
export function useProfileDraft<T extends string | boolean>(key: string, initial: T) {
  const { drafts, setDraft } = useProfile()
  const [value, setValue] = useState<T>(() => typeof drafts[key] === typeof initial ? drafts[key] as T : initial)
  const current = useRef(value)
  const update = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === 'function' ? next(current.current) : next
    current.current = resolved
    setValue(resolved)
    setDraft(key, resolved)
  }, [key, setDraft])
  return [value, update] as const
}
