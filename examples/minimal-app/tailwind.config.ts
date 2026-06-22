import type { Config } from 'tailwindcss'
import { baseTheme } from '@govcore/theme'

export default {
  presets: [baseTheme as unknown as Partial<Config>],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/nextkit/src/**/*.{ts,tsx}',
  ],
} satisfies Config
