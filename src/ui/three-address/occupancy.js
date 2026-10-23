const TEMPORARIES = ['T1', 'T2', 'T3'];
const reads = operand => !operand ? [] : operand.kind === 'externalCall'
  ? operand.args.flatMap(reads)
  : ['temporary', 'symbol'].includes(operand.kind) ? [operand.producer] : [];
const inputs = row => row.kind === 'operation' ? [...reads(row.left), ...reads(row.right)]
  : row.kind === 'assignment' ? reads(row.value) : [];

/** Occupancy after each displayed row, preserving producer lifetimes and pending rows. */
export function temporaryOccupancy(instructions, closure) {
  const remaining = new Map(), slots = new Map();
  const add = n => remaining.set(n, (remaining.get(n) ?? 0) + 1);
  for (const row of instructions) inputs(row).forEach(add);
  reads(closure?.target).forEach(add);
  const snapshot = () => TEMPORARIES.filter(name => slots.has(name));
  function consume(numbers) {
    for (const n of numbers) {
      remaining.set(n, remaining.get(n) - 1);
      if (!remaining.get(n)) for (const [name, producer] of slots) if (producer === n) slots.delete(name);
    }
  }
  const rows = instructions.map(row => {
    consume(inputs(row));
    if (row.kind === 'operation' && remaining.get(row.origin.quadrupleNumber)) slots.set(row.destination, row.origin.quadrupleNumber);
    return snapshot();
  });
  consume(reads(closure?.target));
  return { rows, closure: snapshot() };
}
export function formatOccupancy(names) {
  return names.length === 3 ? 'todos' : names.length ? names.join(', ') : 'ninguno';
}
