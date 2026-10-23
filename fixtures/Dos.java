public class Dos {
    public double dos(int t, float c){
        return t/3+35*2-c;
    }

    public static void main(String[] args) {
        Dos obj = new Dos();
        char siete = (char)(obj.dos('2', 0.5f)/2+2);
        String cad="SISTEMAS";
        System.out.println(siete+"BARCO".substring(3,4)+(char)81+cad.charAt(5));
    }
}
