export function Pagination({ page, pages, total, change, label }: {page:number;pages:number;total:number;change:(page:number)=>void;label:string}) {
  if (pages <= 1) return null
  return <nav aria-label={`${label} pages`} className="flex" style={{gap:12,alignItems:'center',flexWrap:'wrap'}}>
    <button className="btn sm" disabled={page===0} onClick={()=>change(page-1)}>Previous {label}</button>
    <span role="status">Page {page+1} of {pages} · {total} results</span>
    <button className="btn sm" disabled={page===pages-1} onClick={()=>change(page+1)}>Next {label}</button>
  </nav>
}
