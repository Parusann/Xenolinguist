import { Component, type ReactNode } from 'react'
/** Keep providers and their durable draft queues mounted if a panel cannot render. */
export class WorkspaceBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed ? <main style={{padding:32}}><h1>Workspace view could not open</h1>
    <p role="alert">The save queue remains open. Retry the view without discarding your drafts.</p>
    <button className="btn" onClick={()=>this.setState({failed:false})}>Retry workspace view</button></main> : this.props.children}
}
