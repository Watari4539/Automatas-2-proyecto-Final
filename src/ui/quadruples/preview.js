import { createQuadruplesView } from './view.js';
import { buildProgramTree } from '../../compiler/tree/program.js';
import { evaluateTree } from '../../compiler/tree/evaluation.js';
import { buildQuadruples, validateQuadruples } from '../../compiler/quadruples/index.js';

const view = createQuadruplesView(document.querySelector('#quadruples-preview'));
const select = document.querySelector('#quadruples-example');
const error = document.querySelector('#preview-error');
let revision = 0;
const wrap = expression => `public class Demo { public static void main(String[] args) { System.out.println(${expression}); } }`;
const balanced = depth => depth ? `(${balanced(depth - 1)}+${balanced(depth - 1)})` : '1';
async function showExample() {
  const current = ++revision, selected = select.value;
  view.clear(); error.hidden = true;
  if (selected === 'empty') return;
  try {
    let source;
    if (selected === 'viernes') {
      const response = await fetch(new URL('../../../fixtures/ArbolViernes.java', import.meta.url));
      if (!response.ok) throw new Error('No se pudo cargar Viernes.');
      source = await response.text();
    } else source = wrap(selected === 'long' ? balanced(7) : selected === 'partial' ? '1/0' : '2+3');
    if (current !== revision) return;
    const built = buildProgramTree(source);
    if (!built.tree) throw new Error('No se pudo construir el árbol del ejemplo.');
    const tree = evaluateTree(built.tree).tree;
    const result = buildQuadruples(tree);
    if (selected === 'invalid') {
      // Intentional corruption only in this preview to exercise the rejection state.
      result.records[0].number = 99;
      result.validation = validateQuadruples(tree, result);
      result.status = 'invalid';
    }
    view.show(result);
  } catch (cause) { if (current === revision) { error.textContent = cause.message; error.hidden = false; } }
}
select.addEventListener('change', showExample);
showExample();
