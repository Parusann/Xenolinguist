import { beliefLabel } from 'shared/constants'

export function EvidenceStatus({ value }: { value: number | null | undefined }) {
  return <span className="badge" title="A recorded user belief; no calibrated probability or validation is implied.">{beliefLabel(value)}</span>
}

export function BeliefInput({ value, onChange, label = 'User belief (optional, 0–100)' }: {
  value: number | null; onChange: (value: number | null) => void; label?: string
}) {
  return <label className="label">{label}
    <input className="input" aria-label={label} type="number" min={0} max={100} value={value ?? ''}
      placeholder="Unrated" onChange={event => {
        const text = event.target.value, next = event.target.valueAsNumber
        if (!text) onChange(null)
        else if (Number.isFinite(next) && next >= 0 && next <= 100) onChange(next)
      }} />
  </label>
}
