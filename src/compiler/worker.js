import { analyzeQuadrupleInput } from './optimization/input.js';
import { analyzeProgram } from './analysis.js';

self.addEventListener('message', ({ data }) => {
  try {
    self.postMessage({ requestId: data.requestId, result: data.mode === 'quadruples' ? analyzeQuadrupleInput(data.source) : analyzeProgram(data.source) });
  } catch {
    self.postMessage({ requestId: data.requestId, error: 'No se pudo terminar el análisis. Revisa el código e inténtalo de nuevo.' });
  }
});
