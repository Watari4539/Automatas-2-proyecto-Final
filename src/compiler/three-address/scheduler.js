import { TEMPORARIES } from './model.js';

export function references(operand) {
  if (operand.kind === 'register') return [operand.number];
  if (operand.kind === 'externalCall') return operand.args.flatMap(references);
  return [];
}

/** Storage simulator shared by search and replay. No source execution or extra slots. */
export function createMachine(records, target) {
  const reads = records.map(r => [...references(r.left), ...references(r.right)]);
  const uses = Array(records.length + 1).fill(0);
  for (const row of reads) for (const n of row) uses[n]++;
  for (const n of references(target)) uses[n]++;
  const initial = () => ({ slots: TEMPORARIES.map(name => ({ name, producers: [] })), variables: [], remaining: [...uses], done: Array(records.length).fill(false) });
  function location(state, number) {
    return [...state.slots, ...state.variables].find(cell => cell.producers.includes(number));
  }
  function equivalent(cell, record) {
    // Only proven identical values of the same ID and invocation may share storage.
    return cell.contextId === record.contextId && cell.producers.every(n => {
      const previous = records[n - 1];
      return previous.result.status === 'available' && record.result.status === 'available'
        && previous.result.type === record.result.type && !!previous.result.symbolic === !!record.result.symbolic && Object.is(previous.result.value, record.result.value);
    });
  }
  function ready(state, index) {
    if (state.done[index]) return false;
    const record = records[index];
    if (reads[index].some(n => !state.done[n - 1] || state.remaining[n] <= 0 || !location(state, n))) return false;
    // Observable outputs retain source order even when independent branches move.
    if (record.operator === 'SOUT' && records.some((r, i) => i < index && r.operator === 'SOUT' && !state.done[i])) return false;
    if (record.operator !== '=') return state.slots.some(slot => !slot.producers.length);
    const cell = state.variables.find(v => v.symbolId === record.left.symbolId);
    if (!cell || equivalent(cell, record)) return true;
    return cell.producers.every(n => state.remaining[n] <= reads[index].filter(read => read === n).length);
  }
  function consume(state, numbers) {
    for (const n of numbers) {
      state.remaining[n]--;
      if (!state.remaining[n]) {
        const cell = location(state, n);
        cell.producers = cell.producers.filter(value => value !== n);
      }
    }
  }
  function execute(state, index) {
    const record = records[index];
    if (!ready(state, index)) throw new Error('Instruction is not executable');
    let cell = record.operator === '=' ? state.variables.find(v => v.symbolId === record.left.symbolId) : state.slots.find(slot => !slot.producers.length);
    if (!cell) {
      cell = { symbolId: record.left.symbolId, contextId: record.contextId, producers: [] };
      state.variables.push(cell);
    }
    const destination = cell.name ?? cell.symbolId;
    consume(state, reads[index]);
    if (!cell.name) cell.contextId = record.contextId;
    if (state.remaining[record.number]) cell.producers.push(record.number);
    state.done[index] = true;
    return destination;
  }
  return { initial, location, ready, consume, execute };
}

/** Deterministic bounded DFS. Try original order first; backtrack only on a dead end. */
export function schedule(records, machine, { maxStates = 10000, maxSteps = 100000, maxSearchRecords = 256 } = {}) {
  for (const [name, value, ceiling] of [['maxStates', maxStates, 10000], ['maxSteps', maxSteps, 100000], ['maxSearchRecords', maxSearchRecords, 256]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new RangeError(`${name} fuera de rango.`);
  }
  const sequential = machine.initial(), prefix = [];
  for (let i = 0; i < records.length; i++) {
    if (!machine.ready(sequential, i)) break;
    machine.execute(sequential, i); prefix.push(i);
  }
  if (prefix.length === records.length) return { status: 'success', order: prefix, states: 0, steps: 0 };
  if (records.length > maxSearchRecords) return { status: 'limit', order: prefix, states: 0, steps: 0 };
  const exhausted = new Set();
  const key = state => JSON.stringify([state.done, state.slots.map(s => s.producers), [...state.variables].sort((a,b) => a.symbolId.localeCompare(b.symbolId)).map(v => [v.symbolId, v.contextId, v.producers])]);
  let states = 1, steps = 0;
  const stack = [{ state: machine.initial(), next: 0, order: [] }];
  while (stack.length) {
    const frame = stack.at(-1);
    if (frame.order.length === records.length) return { status: 'success', order: frame.order, states, steps };
    if (steps >= maxSteps || states >= maxStates) return { status: 'limit', order: prefix, states, steps };
    if (frame.next >= records.length) { exhausted.add(key(frame.state)); stack.pop(); continue; }
    const i = frame.next++;
    steps++;
    if (!machine.ready(frame.state, i)) continue;
    const next = structuredClone(frame.state);
    machine.execute(next, i);
    if (exhausted.has(key(next))) continue;
    states++;
    stack.push({ state: next, next: 0, order: [...frame.order, i] });
  }
  return { status: 'blocked', order: prefix, states, steps };
}
