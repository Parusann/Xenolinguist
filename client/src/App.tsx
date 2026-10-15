import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { isPublicSite } from '@/lib/site'
const Workbench=lazy(()=>import('./Workbench'))
const HeroPage=lazy(()=>import('@/components/marketing/HeroPage').then(module=>({default:module.HeroPage})))
export default function App(){
  return <Suspense fallback={<p role="status" style={{padding:24}}>Opening Xenolinguist…</p>}><Routes>
    <Route path="/" element={<HeroPage/>}/>
    <Route path="/app" element={isPublicSite?<Navigate to="/#download" replace/>:<Workbench/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>
}
