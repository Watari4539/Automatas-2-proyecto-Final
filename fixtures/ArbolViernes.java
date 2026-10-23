package asesorías;

public class Viernes {
    public double a(int x, String y) {
        int variable = (int)(Math.random()*2);
        return x*variable+variable/3;
    }

    public static void main(String[] a) {
        int num = '@'/10;
        System.out.println(new Viernes().a(num, "URIANGATO"));
    }
}
