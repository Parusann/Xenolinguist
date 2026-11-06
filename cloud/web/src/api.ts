import { useEffect, useReducer, useState } from 'react';
import type { ComparisonReport } from '../../../shared/schemas/atlas-comparison.js';
import type { VersionMetadata } from '../../../shared/schemas/atlas.js';

export type User = { id: string; name: string; email: string };
export type Dataset = { id: string; title: string; language_kind: string; created_at: string; versions?: number };
export type Version = { id: string; revision: number; row_count: number; created_at: string; import_format: string; rights: VersionMetadata['rights']; features: VersionMetadata['features'] };
export type Job = { id: string; version_id: string; status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled'; attempts: number;
  error_code?: string; created_at: string; finished_at?: string; report?: ComparisonReport };
export type Source = { id: string; version: string; sha256: string; url: string; license: string; attribution: string; languages: number; forms: number; features: number };
export type Status = { sharing: string; trainingPermission: boolean; worker: { active: boolean; running: boolean; lastError: string | null; lastCleanupAt: string | null };
  deletion: { pendingObjects: number }; backup?: { lastVerifiedAt: string | null; independent: boolean; stale: boolean } };
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function api<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { method, credentials: 'same-origin', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('The local atlas is unavailable. Start it and retry. Your saved evidence remains on the server.');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, response.status === 401 ? 'Your session has ended. Sign in again.' : error.message || 'The request could not complete.');
  }
  return response.json();
}
export function useResource<T>(url: string, enabled = true) {
  const [data, setData] = useState<T>(), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [revision, reload] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    api<T>(url, 'GET', undefined, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision, enabled]);
  return { data, error, loading, reload };
}
export function useTask() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'The operation failed.'); }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}
export const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const percent = (value: number | null) => value === null ? 'No evidence' : Math.round(value * 100) + '%';
export const navigate = (route: string) => { location.hash = route; };
