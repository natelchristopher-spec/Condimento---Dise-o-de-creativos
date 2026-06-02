import { Montserrat, Inter } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-m',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-i',
  display: 'swap',
});

export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${montserrat.variable} ${inter.variable}`}>
      {children}
    </div>
  );
}
