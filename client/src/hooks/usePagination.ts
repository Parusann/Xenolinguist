import { useState } from 'react'
export function usePagination<T>(items: readonly T[], query: string, size = 50) {
  const [selection, setSelection] = useState({ query, page: 0 })
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(selection.query === query ? selection.page : 0, pages - 1)
  return { items: items.slice(page * size, (page + 1) * size), page, pages, total: items.length, size,
    change: (next: number) => setSelection({ query, page: Math.max(0, Math.min(next, pages - 1)) }) }
}
