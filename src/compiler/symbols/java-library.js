/** Raíces reconocidas de Java. Los miembros heredan el origen de su receptor. */
export const JAVA_TYPES = new Set([
  'String', 'System', 'Math', 'StrictMath', 'Object', 'Integer', 'Long', 'Double',
  'Float', 'Boolean', 'Character', 'Byte', 'Short', 'Number', 'Class', 'Enum',
  'StringBuilder', 'StringBuffer', 'Exception', 'RuntimeException', 'Throwable',
  'Error', 'Thread', 'Runnable', 'Comparable', 'Iterable', 'AutoCloseable',
]);
export const JAVA_PACKAGE_ROOTS = new Set(['java', 'javax']);

/** Nombres conocidos para importaciones con *; no inferir cualquier nombre. */
export const JAVA_PACKAGES = Object.freeze({
  'java.lang': JAVA_TYPES,
  'java.util': new Set(['Scanner', 'Random', 'Arrays', 'Collections', 'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'Set', 'HashSet', 'Date', 'Calendar', 'Optional', 'Objects', 'Locale', 'Iterator', 'Comparator']),
  'java.io': new Set(['File', 'IOException', 'InputStream', 'OutputStream', 'Reader', 'Writer', 'BufferedReader', 'InputStreamReader', 'PrintStream', 'PrintWriter', 'FileReader', 'FileWriter']),
});
