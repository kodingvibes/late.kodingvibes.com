import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Home } from './Home'
import { ThemeProvider } from '@/providers/theme-provider'

const mockPlay = vi.fn()

vi.mock('@/audio/AudioProvider', () => ({
  useAudio: () => ({
    current: null,
    playing: false,
    play: mockPlay,
  }),
}))

vi.mock('@/lib/use-document-title', () => ({
  default: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: any) => <a href={to}>{children}</a>,
}))

vi.mock('@/audio/MiniPlayer', () => ({
  default: () => null,
}))

const wrap = (children: React.ReactNode) => (
  <ThemeProvider>{children}</ThemeProvider>
)

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    const { container } = render(wrap(<Home />))
    expect(container).toBeDefined()
  })

  it('shows featured streams', () => {
    const { getAllByText } = render(wrap(<Home />))
    expect(getAllByText('Groove Salad').length).toBeGreaterThan(0)
    expect(getAllByText('Drone Zone').length).toBeGreaterThan(0)
    expect(getAllByText('Fluid').length).toBeGreaterThan(0)
  })
})
