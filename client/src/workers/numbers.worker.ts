import { inferNumbers } from 'engine/numbers/score'
import { nextNumberQuestion } from 'engine/numbers/predict'
self.onmessage = (event: MessageEvent<unknown>) => {
  const inference = inferNumbers(event.data)
  const values = inference.candidates[0] ? [...inference.candidates[0].fit, ...inference.candidates[0].validation].map(c => c.value) : []
  self.postMessage({ inference, question: nextNumberQuestion(inference, values) })
}
