import { induceGrounded } from 'engine/induction/candidate-search'
self.onmessage = (event: MessageEvent<unknown>) => { self.postMessage(induceGrounded(event.data)) }
