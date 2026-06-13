import { Router } from 'express'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { dataDir } from '../config.js'

const router = Router()
function audioDir() { return join(dataDir(), 'audio') }

// Audio ids are client-generated and flow straight into filesystem paths below.
// Constrain them to a safe charset so a crafted id can never escape audioDir()
// via path separators or `..` segments (path traversal -> arbitrary read/write/delete).
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

// Ensure audio directory exists
async function ensureDir() {
  if (!existsSync(audioDir())) {
    await mkdir(audioDir(), { recursive: true })
  }
}

// Upload audio clip (base64-encoded in the JSON body). Effective size ceiling is the global
// express.json({ limit: '50mb' }) in app.ts; base64 inflates ~33%, so ~37MB of raw audio.
router.post('/upload', async (req, res) => {
  try {
    await ensureDir()
    const { id, data } = req.body

    if (!id || !data) {
      return res.status(400).json({ error: 'Missing id or data' })
    }
    if (typeof id !== 'string' || !SAFE_ID.test(id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }

    // Derive the format from the actual bytes, not the attacker-controlled mimeType:
    // WAV = "RIFF"..."WAVE"; WebM/Matroska = EBML magic 1A 45 DF A3. Reject anything else.
    const buffer = Buffer.from(data, 'base64')
    const isWav = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE'
    const isWebm = buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
    if (!isWav && !isWebm) {
      return res.status(400).json({ error: 'Unsupported audio format' })
    }
    const ext = isWav ? 'wav' : 'webm'
    const filename = `${id}.${ext}`
    const filepath = join(audioDir(), filename)

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
    if (!SAFE_ID.test(id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }

    // Try webm first, then wav
    for (const ext of ['webm', 'wav']) {
      const filepath = join(audioDir(), `${id}.${ext}`)
      if (existsSync(filepath)) {
        const data = await readFile(filepath)
        const mimeType = ext === 'wav' ? 'audio/wav' : 'audio/webm'
        res.setHeader('Content-Type', mimeType)
        return res.send(data) // res.send(Buffer) sets Content-Length automatically
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
    if (!SAFE_ID.test(id)) {
      return res.status(400).json({ error: 'Invalid id' })
    }

    for (const ext of ['webm', 'wav']) {
      const filepath = join(audioDir(), `${id}.${ext}`)
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
