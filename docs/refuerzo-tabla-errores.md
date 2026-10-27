# Refuerzo de la tabla de errores

La revisión admite <=, >=, !=, &&, || y ^ con precedencia y comprobación de tipos, sin cambiar los tokens acordados para la tabla de símbolos. Un operador sin token académico puede seguir produciendo un aviso de cobertura, pero no un falso error de punto y coma.

Los casts numéricos constantes y los caracteres conservan su valor durante la revisión semántica. Esto permite estrechamientos constantes válidos y detectar divisores enteros cero ocultos en casts o expresiones. Las constantes float se redondean a precisión float antes de participar en otras operaciones.

Las operaciones flotantes pueden producir Infinity o NaN sin diagnosticarse como literales fuera de rango. Los literales demasiado grandes siguen siendo errores. Se conserva la política académica previa de señalar overflow entero y división entera por cero.

Se detectan lecturas dentro del propio inicializador local y lecturas de locales sin inicializar en el mismo ámbito lineal revisado. Se distinguen destinos de asignación, parámetros y campos con valores iniciales por defecto. No se pretende un análisis completo de inicialización definida en bifurcaciones/ciclos: los ámbitos con instrucciones no revisadas conservan sus avisos de cobertura.

La tabla mantiene fragmento de código, categorías en orden léxico/sintáctico/semántico, posición y justificaciones menores de 50 palabras. Pruebas nuevas en tests/error-polish.test.js; 319 pruebas totales aprobadas al completar el refuerzo. Inventario de caché regenerado.
