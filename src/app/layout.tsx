import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EXPOSED VDR',
  description: '¿Quién será el EXPUESTO? Juego de fiesta para grupos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
