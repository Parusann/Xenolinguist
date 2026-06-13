import { describe, it, expect, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { DownloadSection } from './DownloadSection'

afterEach(() => { cleanup() })

describe('DownloadSection', () => {
  it('renders a Windows download link pointing at the releases fallback', () => {
    render(<DownloadSection />)
    const link = screen.getByRole('link', { name: /download for windows/i })
    // VITE_DOWNLOAD_URL is unset under test, so DOWNLOAD_URL uses the fallback.
    expect(link.getAttribute('href')).toBe(
      'https://github.com/Parusann/Xenolinguist/releases/latest',
    )
  })

  it('states the SmartScreen "Run anyway" reality and the Ollama requirement', () => {
    render(<DownloadSection />)
    expect(screen.getByText(/run anyway/i)).toBeTruthy()
    expect(screen.getByText(/ollama/i)).toBeTruthy()
  })

  it('has an anchor id so CTAs can scroll to it', () => {
    const { container } = render(<DownloadSection />)
    expect(container.querySelector('#download')).not.toBeNull()
  })
})
