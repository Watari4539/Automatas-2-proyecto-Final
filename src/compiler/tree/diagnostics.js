/** Incidencias de construcción; no se insertan en la tabla de errores de Java. */
export class TreeConstructionError extends Error {
  constructor(status, code, message, at = null) {
    super(message);
    this.status = status;
    this.diagnostic = {
      code, message,
      source: at ? { start: at.start, end: at.end, line: at.line, column: at.column } : null,
    };
  }
}

export function stopTree(status, code, message, at) {
  throw new TreeConstructionError(status, code, message, at);
}
