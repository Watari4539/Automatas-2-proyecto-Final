public class Ejemplo {
    // Método que recibe un parámetro
    public static void mostrarProcesos(int limite) {
        int contadorBase = 10;
        int deltaPaso = 5;
        int valorTemporal = 100;
        int resultadoParcial = 0;
        int indiceCiclo = 0;
        int estadoFinal = 1;

        resultadoParcial = (contadorBase * deltaPaso) + valorTemporal + limite;
        indiceCiclo = resultadoParcial / deltaPaso;

        System.out.println("Resultado obtenido: " + resultadoParcial);
        System.out.println("Índice calculado: " + indiceCiclo);
        System.out.println("Estado final del proceso: " + estadoFinal);
    }

    public static void main(String[] args) {
        mostrarProcesos(20);
    }
}
