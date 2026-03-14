import './globals.css'
import Providers from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#0b1020', color: '#fff' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
