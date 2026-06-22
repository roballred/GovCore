import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: 'GovCore — Minimal App',
  description: 'A minimal Next.js app built on the GovCore platform packages.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
