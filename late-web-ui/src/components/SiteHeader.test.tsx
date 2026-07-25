import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SiteHeader from './SiteHeader'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    Link: ({ children, to, className }: any) => <a href={to} className={className}>{children}</a>,
    useLocation: vi.fn(),
  }
})

import { useLocation } from 'react-router-dom'
import { ThemeProvider } from '@/providers/theme-provider'

describe('SiteHeader', () => {
  beforeEach(() => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/', search: '', hash: '', state: null, key: '' })
    // chat MF isn't loaded in tests; window.ChatEngine is undefined.
    ;(window as unknown as { ChatEngine?: unknown }).ChatEngine = undefined
  })

  const wrap = (children: React.ReactNode) => (
    <MemoryRouter>
      <ThemeProvider>{children}</ThemeProvider>
    </MemoryRouter>
  )

  it('renders the brand link', () => {
    const { getByText } = render(wrap(<SiteHeader />))
    expect(getByText(/late\.kodingvibes\.com/i).textContent).toBeTruthy()
  })

  it('renders the radio + chat icon links', () => {
    const { container } = render(wrap(<SiteHeader />))
    const header = container.querySelector('header')
    expect(header).toBeTruthy()
    const links = header?.querySelectorAll('a') ?? []
    const hrefs = Array.from(links).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/icecast')
    expect(hrefs).toContain('/irc')
  })

  it('active state for /icecast path', () => {
    vi.mocked(useLocation).mockReturnValue({ pathname: '/icecast', search: '', hash: '', state: null, key: '' })
    const { container } = render(wrap(<SiteHeader />))
    const radioLink = container.querySelector('a[href="/icecast"]')
    expect(radioLink?.className).toContain('bg-indigo')
  })

  it('shows the online count badge when ChatEngine publishes it', () => {
    ;(window as unknown as { ChatEngine?: { onlineCount: number } }).ChatEngine = { version: '1.0.0', onlineCount: 7 }
    const { container } = render(wrap(<SiteHeader />))
    expect(container.textContent).toContain('7')
  })
})
