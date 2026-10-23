// Standalone preview for step 8; the production analysis worker is unchanged.
import { createTreeViewer } from './viewer.js';
import { layoutTree } from './layout.js';
import { buildExpressionTree } from '../../compiler/tree/expressions.js';
import { buildProgramTree } from '../../compiler/tree/program.js';
import { evaluateTree } from '../../compiler/tree/evaluation.js';

const viewer = createTreeViewer(document.querySelector('#tree-preview'));
const select = document.querySelector('#tree-example');
const error = document.querySelector('#preview-error');
let revision = 0;
async function showExample() {
  const current = ++revision;
  const selected = select.value;
  error.hidden = true;
  viewer.clear();
  if (selected === 'empty') return;
  try {
    let built;
    if (selected === 'expression') built = buildExpressionTree("char a='A'; int b=35/10+a-(23+2)/5-10;", 'ID2');
    else {
      const response = await fetch(new URL('../../../fixtures/ArbolViernes.java', import.meta.url));
      if (!response.ok) throw new Error('No se pudo cargar el ejemplo.');
      built = buildProgramTree(await response.text());
    }
    if (current !== revision) return;
    if (!built.tree) throw new Error('No se pudo construir el árbol del ejemplo.');
    viewer.show(layoutTree(evaluateTree(built.tree).tree));
  } catch (cause) {
    if (current !== revision) return;
    error.textContent = cause.message;
    error.hidden = false;
  }
}
select.addEventListener('change', showExample);
showExample();
