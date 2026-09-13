import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { DownloadSection } from './DownloadSection'

afterEach(() => { cleanup() })

describe('DownloadSection', () => {
  it('pins the Windows asset to the version described beside it', () => {
    render(<DownloadSection />)
    const link = screen.getByRole('link', { name: /download v1.0.0 for windows/i })
    expect(link.getAttribute('href')).toBe(
      'https://github.com/Parusann/Xenolinguist/releases/download/v1.0.0/Xenolinguist-Setup-1.0.0.exe',
    )
  })

  it('distinguishes the old unsigned release from preview setup', () => {
    render(<DownloadSection />)
    expect(screen.getByText(/unknown publisher/i)).toBeTruthy()
    expect(screen.getByText(/have not been released in a new installer/i)).toBeTruthy()
    expect(screen.getByText(/AI needs a running local Ollama service/i)).toBeTruthy()
  })

  it('has an anchor id so CTAs can scroll to it', () => {
    const { container } = render(<DownloadSection />)
    expect(container.querySelector('#download')).not.toBeNull()
  })
})
