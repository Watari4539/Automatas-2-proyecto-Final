

public class PruebaCompleta {

    public double calcular(int base, float factor) {
        int extra = 33 + 2;
        double ajuste = (99 + 10) / 1;
        double total = base * factor + ajuste + extra;
        return total;
    }

    public char convertir(int numero) {
        char letra = (char) (numero + 65);
        return letra;
    }

    public String construir(int entrada) {
        double resultado = calcular(entrada, 2.5f);
        char marca = convertir(2);
        String palabra = "AUTOMATAS";
        int longitud = palabra.length();

        return palabra.substring(0, 4)
            + "-"
            + marca
            + ": "
            + resultado
            + " / "
            + longitud;
    }

    public static void main(String[] args) {
        int numero = 6 * 2;
        System.out.println(new PruebaCompleta().construir(numero));
    }
}