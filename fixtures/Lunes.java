public class Lunes {

    public char m (double a, int b, char c){
        float d = (float) (a/b);
        int e = c + 1;

        return (char) (d+e);
    }

    public static void main(String[] args) {
        System.out.println(new Lunes().m(15, 7, 'd'));
    }
}