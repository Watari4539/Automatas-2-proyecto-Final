import { createThreeAddressView } from './view.js';
import { buildProgramTree } from '../../compiler/tree/program.js';
import { evaluateTree } from '../../compiler/tree/evaluation.js';
import { buildQuadruples } from '../../compiler/quadruples/index.js';
import { buildThreeAddress, validateThreeAddress } from '../../compiler/three-address/index.js';
const view = createThreeAddressView(document.querySelector('#three-address-preview'));
const select = document.querySelector('#three-address-example');
const error = document.querySelector('#preview-error');
let revision = 0;
const wrap = body => `public class Demo { public static void main(String[] args) { ${body} } }`;
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
    } else {
      const examples = {
        pending: 'int a=1+2;int b=3+4;int c=5+6;int d=7+8;System.out.println((a+b)+(c+d));',
        long: 'System.out.println(' + Array(102).fill('1').join('+') + ');',
        partial: 'System.out.println(1/0);',
        blocked: 'System.out.println(((1+2)+(3+4))+((5+6)+(7+8)));',
        unsupported: 'System.out.println((char)81);',
        invalid: 'System.out.println(2+3);',
      };
      source = wrap(examples[selected]);
    }
    if (current !== revision) return;
    const built = buildProgramTree(source);
    if (!built.tree) throw new Error(built.diagnostics[0]?.message ?? 'No se pudo construir el árbol.');
    const tree = evaluateTree(built.tree).tree;
    const quads = buildQuadruples(tree);
    const result = buildThreeAddress(tree, quads);
    if (selected === 'invalid') {
      result.instructions[0].destination = 'T4';
      result.validation = validateThreeAddress(tree, quads, result);
      result.status = 'invalid';
    }
    view.show(result);
  } catch (cause) { if (current === revision) { error.textContent = cause.message; error.hidden = false; } }
}
select.addEventListener('change', showExample);
showExample();
