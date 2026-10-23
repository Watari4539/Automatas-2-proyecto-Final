/** Text only; programmer source is never HTML. */
export function formatOperand(operand) {
  switch (operand.kind) {
    case 'temporary': return operand.name;
    case 'symbol':
    case 'symbolIdentity': return operand.symbolId;
    case 'constructor': return `${operand.symbolId}()`;
    case 'main': return 'PMAIN';
    case 'literal':
    case 'external': return operand.text;
    case 'externalCall': return `${operand.name}(${operand.args.map(formatOperand).join(', ')})`;
    default: throw new TypeError('Operando de tres direcciones desconocido.');
  }
}
export function formatInstruction(instruction) {
  switch (instruction.kind) {
    case 'operation': return `${instruction.destination}. (${formatOperand(instruction.left)}, ${instruction.operator}, ${formatOperand(instruction.right)})`;
    case 'assignment': return `${instruction.symbolId} = ${formatOperand(instruction.value)}`;
    case 'pending': return `P${instruction.treeOperationNumber}`;
    default: throw new TypeError('Instrucción de tres direcciones desconocida.');
  }
}
export function formatClosure(closure) {
  return closure ? `${closure.classSymbolId} PMAIN → ${formatOperand(closure.target)}` : '';
}
