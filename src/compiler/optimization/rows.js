/** One independent explanation row per original occurrence. No display parsing. */
export function buildOptimizationRows(output) {
  if (output.status !== 'success') return [];
  const uses = (operand, number) => operand?.kind === 'register' ? operand.number === number
    : operand?.kind === 'externalCall' && operand.args.some(arg => uses(arg, number));
  const originals = new Map(output.originals.map(record => [`q${record.number}`, record]));
  const finals = new Map(output.records.map(record => [record.number, record]));
  const eventsById = new Map();
  for (const event of output.events) {
    if (!originals.has(event.recordId)) throw new TypeError('Evento sin cuádruplo original.');
    const affectedNumbers = [...new Set(event.affectedRecordIds.map(id => {
      const original = originals.get(id);
      if (!original) throw new TypeError('Cuádruplo afectado desconocido.');
      return original.number;
    }))].sort((a, b) => a - b);
    const events = eventsById.get(event.recordId) ?? [];
    events.push({ ...structuredClone(event), affectedNumbers });
    eventsById.set(event.recordId, events);
  }
  return output.originals.map(original => {
    const recordId = `q${original.number}`;
    const finalNumber = output.numberMap[recordId];
    if (finalNumber !== null && !finals.has(finalNumber)) throw new TypeError('Falta el cuádruplo final.');
    return {
      recordId,
      original: structuredClone(original),
      affectedNumbers: output.originals.filter(record => record !== original &&
        (uses(record.left, original.number) || uses(record.right, original.number))).map(record => record.number),
      affectsClosure: !!output.closure && finalNumber !== null && uses(output.closure.target, finalNumber),
      events: (eventsById.get(recordId) ?? []).sort((a, b) => a.sequence - b.sequence),
      final: finalNumber === null ? null : structuredClone(finals.get(finalNumber)),
    };
  });
}
