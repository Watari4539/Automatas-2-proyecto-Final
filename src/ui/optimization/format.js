import { formatRecord } from '../quadruples/format.js';
import { techniqueLabel } from '../../compiler/optimization/model.js';

export const OPTIMIZATION_COLUMNS = Object.freeze([
  'CUÁDRUPLO ORIGINAL', 'OPTIMIZACIÓN', 'CUÁDRUPLO AFECTADO', 'CUÁDRUPLO MODIFICADO',
]);

/** Plain strings only. A future view must use textContent, never innerHTML. */
export function formatOptimizationRow(row) {
  const original = formatRecord(row.original);
  const techniques = [], affected = [], modifications = [];
  for (const event of row.events) {
    techniques.push(techniqueLabel(event.technique, event.derived));
    const targets = event.affectedNumbers.map(String);
    if (event.affectsClosure) targets.push('cierre');
    affected.push(targets.length ? targets.join(', ') : '—');
    if (event.action === 'remove') {
      const before = formatRecord(event.before);
      modifications.push(before === original ? 'ELIMINAR' : `${before} → ELIMINAR`);
    } else if (event.action === 'replace' && event.after) {
      modifications.push(`${formatRecord(event.before)} → ${formatRecord(event.after)}`);
    } else throw new TypeError('Transformación sin formato explicativo.');
  }
  if (row.final) {
    const final = formatRecord(row.final);
    // A surviving row with intermediate events still exposes its final state.
    modifications.push(final);
  } else if (!row.events.length) throw new TypeError('Fila eliminada sin explicación.');
  return {
    original,
    optimization: techniques.length ? techniques.join('\n') : '—',
    affected: affected.length ? affected.join('\n') : '—',
    modified: modifications.join('\n'),
  };
}

export function formatOptimizationTable(output) {
  return output.status === 'success' ? output.rows.map(formatOptimizationRow) : [];
}
