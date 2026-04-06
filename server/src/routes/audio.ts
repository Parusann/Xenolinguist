import { Router } from 'express'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const router = Router()
const AUDIO_DIR = join(import.meta.dirname, '../../data/audio')

// Ensure audio directory exists
async function ensureDir() {
  if (!existsSync(AUDIO_DIR)) {
    await mkdir(AUDIO_DIR, { recursive: true })
  }
}

// Upload audio clip (base64 encoded in JSON body)
router.post('/upload', async (req, res) => {
  try {
    await ensureDir()
    const { id, data, mimeType } = req.body

    if (!id || !data) {
      return res.status(400).json({ error: 'Missing id or data' })
    }

    // data is base64-encoded audio
    const buffer = Buffer.from(data, 'base64')
    const ext = mimeType?.includes('wav') ? 'wav' : 'webm'
    const filename = `${id}.${ext}`
    const filepath = join(AUDIO_DIR, filename)

    await writeFile(filepath, buffer)

    res.json({ filename, size: buffer.length })
  } catch (err) {
    console.error('Audio upload error:', err)
    res.status(500).json({ error: 'Failed to upload audio' })
  }
})

// Get audio clip by id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Try webm first, then wav
    for (const ext of ['webm', 'wav']) {
      const filepath = join(AUDIO_DIR, `${id}.${ext}`)
      if (existsSync(filepath)) {
        const data = await readFile(filepath)
        const mimeType = ext === 'wav' ? 'audio/wav' : 'audio/webm'
        res.setHeader('Content-Type', mimeType)
        res.setHeader('Content-Length', data.length)
        return res.send(data)
      }
    }

    res.status(404).json({ error: 'Audio not found' })
  } catch (err) {
    console.error('Audio fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch audio' })
  }
})

// Delete audio clip
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    for (const ext of ['webm', 'wav']) {
      const filepath = join(AUDIO_DIR, `${id}.${ext}`)
      if (existsSync(filepath)) {
        await unlink(filepath)
        return res.json({ deleted: true })
      }
    }

    res.status(404).json({ error: 'Audio not found' })
  } catch (err) {
    console.error('Audio delete error:', err)
    res.status(500).json({ error: 'Failed to delete audio' })
  }
})

export default router
