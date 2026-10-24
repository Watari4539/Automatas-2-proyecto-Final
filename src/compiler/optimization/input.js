import { readLiteral, annotation, convertValue, binaryValue } from '../tree/values.js';
import { optimizeQuadruples } from './index.js';

function splitFields(text) {
  const fields = []; let start = 0, depth = 0, quote = null, escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') { if (--depth < 0) throw new Error('Delimitadores desbalanceados.'); }
    else if (c === ',' && depth === 0) { fields.push(text.slice(start,i).trim()); start = i+1; }
  }
  if (quote || depth) throw new Error('Comillas o delimitadores sin cerrar.');
  fields.push(text.slice(start).trim());
  if (fields.length !== 4 || fields.some(f => !f)) throw new Error('Se requieren cuatro campos separados por comas.');
  return fields;
}
function value(text) {
  if (/^-[0-9]/.test(text)) { const v = readLiteral(text.slice(1)); return {...v, value: -v.value}; }
  return readLiteral(text);
}

/** Parses classroom tuples as data; never evaluates JavaScript or Java. */
export function analyzeQuadrupleInput(source) {
  let line = 0;
  try {
    if (typeof source !== 'string' || source.length > 100000) throw new Error('Máximo 100 000 caracteres.');
    const records = []; let closure = null;
    const operand = text => {
      if (/^\[\d+\]$/.test(text)) {
        const number = Number(text.slice(1,-1));
        if (number < 1 || number > records.length) throw new Error('El registro debe existir antes de utilizarse.');
        return {kind:'register',number};
      }
      if (/^ID[1-9]\d*$/.test(text)) return {kind:'symbol',symbolId:text};
      if (/^ID[1-9]\d*\(\)$/.test(text)) return {kind:'constructor',symbolId:text.slice(0,-2)};
      if (text === 'PMAIN') return {kind:'main'};
      try { const v=value(text), a=annotation(v); return {kind:'literal',text:a.display,type:v.type,value:v.value,token:a.token}; }
      catch { if (/^[\p{L}_$][\p{L}\p{N}_$]*(?:\([^\n]*\))?$/u.test(text)) return {kind:'external',text}; }
      throw new Error(`Operando no reconocido: ${text}`);
    };
    for (const raw of source.split(/\r\n|\r|\n/)) {
      line++; const text=raw.trim(); if (!text) continue;
      if (closure) throw new Error('El cierre debe ser la última línea.');
      const end=/^(ID[1-9]\d*)\s+PMAIN\s*(?:→|->)\s*(\[\d+\])$/.exec(text);
      if (end) { closure={classSymbolId:end[1],entry:'PMAIN',target:operand(end[2])}; continue; }
      const match=/^(\d+)\s*(?:\.\s*-?|\))?\s*\((.*)\)\s*$/.exec(text);
      if (!match || Number(match[1]) !== records.length+1) throw new Error('Usa números consecutivos desde 1: 1.- (izquierdo, operador, derecho, resultado).');
      if (records.length >= 2000) throw new Error('Máximo 2000 cuádruplos.');
      const [leftText,operator,rightText,resultText]=splitFields(match[2]);
      if (!['+','-','*','/','=','RTN','.','SOUT'].includes(operator)) throw new Error(`Operador no admitido: ${operator}`);
      const left=operand(leftText), right=operand(rightText);
      const result={status:'available',...annotation(value(resultText))};
      if (operator === '=' && left.kind !== 'symbol' || operator === 'RTN' && left.kind !== 'symbol' || operator === 'SOUT' && left.kind !== 'main') throw new Error('Destino inválido para asignación, RTN o SOUT.');
      const read = o => o.kind === 'literal' ? o : o.kind === 'register' ? records[o.number-1].result : null;
      const a=read(left), b=read(right);
      let computed=null;
      if (['+','-','*','/'].includes(operator) && a && b) computed=binaryValue(operator,a,b);
      if (['=','RTN'].includes(operator) && b) computed=convertValue(b,result.type,'cast');
      if (operator === 'SOUT' && b) computed=b;
      if (computed && (computed.type !== result.type || !Object.is(computed.value,result.value))) throw new Error('El resultado no coincide con los operandos y su tipo.');
      records.push({number:records.length+1,nodeId:`input${records.length+1}`,contextId:'input',source:{line,column:1,start:0,end:raw.length},left,operator,right,result});
    }
    if (!records.length) throw new Error('Escribe al menos un cuádruplo.');
    const quads={version:1,status:'success',validation:{valid:true},records,closure,diagnostics:[]};
    const counts=new Map();
    for (const r of records) if (r.operator === '=') counts.set(r.left.symbolId,(counts.get(r.left.symbolId)??0)+1);
    // The supplied sequence is the complete input in this mode. Multiple writes
    // to an ID prevent PC; literal provenance is still checked by the optimizer.
    const constantAssignments=records.filter(r=>r.operator==='=' && counts.get(r.left.symbolId)===1).map(r=>`q${r.number}`);
    const optimization=optimizeQuadruples(quads,{constantAssignments});
    if (optimization.status !== 'success') throw new Error(optimization.diagnostics.map(d=>d.message).join(' '));
    return {quadrupleAnalysis:quads,optimizationAnalysis:optimization};
  } catch (error) { return {inputError:`Línea ${line || 1}: ${error.message}`}; }
}
