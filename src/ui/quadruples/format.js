/** Text only: operands and values must never be interpreted as markup. */
export function formatOperand(operand) {
  switch (operand.kind) {
    case 'externalCall': return `${operand.name}(${operand.args.map(formatOperand).join(', ')})`;
    case 'register': return `[${operand.number}]`;
    case 'symbol': return operand.symbolId;
    case 'constructor': return `${operand.symbolId}()`;
    case 'main': return 'PMAIN';
    case 'literal':
    case 'external': return operand.text;
    default: throw new TypeError('Operando de cuádruplo desconocido.');
  }
}
export function formatRecord(record) {
  const value = record.result.status === 'pending' ? 'Pendiente' : record.result.display;
  return `${record.number}.- (${formatOperand(record.left)}, ${record.operator}, ${formatOperand(record.right)}, ${value})`;
}
export function formatClosure(closure) {
  return closure ? `${closure.classSymbolId} PMAIN -> ${formatOperand(closure.target)}` : '';
}
