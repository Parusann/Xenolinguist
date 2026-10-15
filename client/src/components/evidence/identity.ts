export const recordIdentity = () => ({ id: crypto.randomUUID(), created_at: new Date().toISOString() })
