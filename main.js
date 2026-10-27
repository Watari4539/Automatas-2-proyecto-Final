import { createQuadrupleInput } from './src/ui/quadruples/input.js';
import { analyzeQuadrupleInput } from './src/compiler/optimization/input.js';
import { analyzeProgram } from './src/compiler/analysis.js';
import { registerCacheWorker } from './src/pwa/register.js';
import { createSourceHighlighting } from './src/ui/source-highlighting.js';
import { createSourceLineNumbers } from './src/ui/source-editor.js';
import { createSymbolTableView } from './src/ui/symbol-table.js';
import { createErrorTableView } from './src/ui/error-table.js';
import { createQuadruplesView } from './src/ui/quadruples/view.js';
import { createThreeAddressView } from './src/ui/three-address/view.js';
import { createTreeResultsView } from './src/ui/tree/results.js';

const modeSelect = document.querySelector('#input-mode');
let mode = 'java';
const tupleStyle = document.querySelector('#quadruple-entry-style');
const tupleText = document.querySelector('#quadruple-text');
const activeText = () => mode === 'java' ? sourceInput : tupleText;

const form = document.querySelector('#compiler-form');
const sourceInput = document.querySelector('#source-code');
createSourceLineNumbers(sourceInput, document.querySelector('#source-line-numbers'));
createSourceHighlighting(sourceInput);
const metrics = document.querySelector('#source-metrics');
const status = document.querySelector('#analysis-status');
const button = document.querySelector('#generate-button');
const results = createSymbolTableView();
const errors = createErrorTableView();
const tree = createTreeResultsView();
const quadruples = createQuadruplesView(document.querySelector('#quadruples-host'));
const threeAddress = createThreeAddressView(document.querySelector('#three-address-host'));
let worker;
let revision = 0;

function announce(message, kind) {
  status.dataset.kind = kind;
  status.textContent = message;
  status.hidden = false;
}

function busy(value) {
  button.disabled = value;
  button.textContent = value ? 'Generando…' : 'Generar ↗';
  form.setAttribute('aria-busy', String(value));
}

function stopPending() {
  revision++;
  worker?.terminate();
  worker = undefined;
  busy(false);
}

const tupleInput = createQuadrupleInput(document.querySelector('#quadruple-input'), clearAnalysis);
const currentSource = () => mode === 'java' ? sourceInput.value : tupleStyle.value === 'text' ? tupleText.value : tupleInput.source();

function clearAnalysis() {
  const source = sourceInput.value;
  const lines = source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length;
  const characters = Array.from(source).length;
  metrics.textContent = `${lines} ${lines === 1 ? 'línea' : 'líneas'} · ${characters} ${characters === 1 ? 'carácter' : 'caracteres'}`;
  status.hidden = true;
  sourceInput.removeAttribute('aria-invalid');
  tupleText.removeAttribute('aria-invalid');
  stopPending();
  results.clear();
  errors.clear();
  tree.clear();
  quadruples.clear();
  threeAddress.clear();
}
sourceInput.addEventListener('input', clearAnalysis);
tupleText.addEventListener('input', clearAnalysis);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  stopPending();
  results.clear();
  errors.clear();
  tree.clear();
  quadruples.clear();
  threeAddress.clear();
  if (mode === 'quadruples' && tupleStyle.value === 'fields' && !tupleInput.validate()) {
    announce('Completa los cuatro campos de cada cuádruplo.', 'empty');
    return;
  }
  if (!currentSource().trim()) {
    announce(mode === 'java' ? 'Escribe o pega código Java.' : 'Escribe o pega tus cuádruplos.', 'empty');
    activeText().setAttribute('aria-invalid', 'true');
    activeText().focus();
    return;
  }
  sourceInput.removeAttribute('aria-invalid');
  tupleText.removeAttribute('aria-invalid');
  busy(true);
  announce('Analizando…', 'working');
  const requestId = revision;
  const source = currentSource();
  const receive = ({ data }) => {
      if (data.requestId !== revision) return;
      stopPending();
      if (data.error) { announce(data.error, 'incomplete'); return; }
      const { result } = data;
      if (mode === 'quadruples') {
        if (result.inputError) { announce(result.inputError, 'incomplete'); return; }
        quadruples.show(result.quadrupleAnalysis, {optimization: result.optimizationAnalysis, optimizationOnly: true});
        status.hidden = true; status.textContent = ''; return;
      }
      results.show(result);
      errors.show(result);
      tree.show(result);
      quadruples.show(result.quadrupleAnalysis, { hasSourceErrors: result.errors.length > 0, optimization: result.optimizationAnalysis });
      threeAddress.show(result.threeAddressAnalysis, { hasSourceErrors: result.errors.length > 0 });
      status.hidden = true;
      status.textContent = '';
  };
  // Some browsers cannot start module Workers. Reuse the same bounded engine
  // on the page in that case; never load a second implementation from the network.
  const fallback = () => {
    if (requestId !== revision) return;
    worker?.terminate();
    worker = undefined;
    setTimeout(() => {
      if (requestId !== revision) return;
      try { receive({ data: { requestId, result: mode === 'java' ? analyzeProgram(source) : analyzeQuadrupleInput(source) } }); }
      catch (error) {
        console.error('Falló el análisis local.', error);
        stopPending();
        announce('No se pudo terminar el análisis local. Intenta con un código más pequeño o vuelve a abrir la aplicación con conexión para actualizarla.', 'incomplete');
      }
    }, 0);
  };
  try {
    worker = new Worker(new URL('./src/compiler/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = receive;
    worker.onerror = (event) => {
      event.preventDefault();
      console.warn('No se pudo usar el Worker; se utilizará el análisis local.', event.message);
      fallback();
    };
    worker.postMessage({ requestId, source, mode });
  } catch {
    fallback();
  }
});

// Prepare local application files without delaying the editor or analysis.
registerCacheWorker();

function updateEntryView() {
  document.querySelector('#source-code').closest('.editor').hidden = mode !== 'java';
  document.querySelector('#quadruple-entry-options').hidden = mode === 'java';
  document.querySelector('#quadruple-input').hidden = mode === 'java' || tupleStyle.value !== 'fields';
  document.querySelector('#quadruple-text-editor').hidden = mode === 'java' || tupleStyle.value !== 'text';
  clearAnalysis();
}
modeSelect.addEventListener('change', () => {
  mode = modeSelect.value;
  updateEntryView();
});
tupleStyle.addEventListener('change', updateEntryView);
