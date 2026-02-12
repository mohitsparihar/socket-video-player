import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createReadStream, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Storage directories
const VIDEOS_DIR = path.join(__dirname, '../videos');
const GPS_DIR = path.join(__dirname, '../gps-data');

// Ensure directories exist
async function ensureDirectories() {
    try {
        await fs.mkdir(VIDEOS_DIR, { recursive: true });
        await fs.mkdir(GPS_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating directories:', error);
    }
}
ensureDirectories();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        if (file.fieldname === 'video') {
            cb(null, VIDEOS_DIR);
        } else if (file.fieldname === 'gps') {
            cb(null, GPS_DIR);
        } else {
            cb(new Error('Invalid field name'));
        }
    },
    filename: (req, file, cb) => {
        const uniqueId = `video-${Date.now()}`;
        req.videoId = uniqueId;

        if (file.fieldname === 'video') {
            const ext = path.extname(file.originalname);
            cb(null, `${uniqueId}${ext}`);
        } else if (file.fieldname === 'gps') {
            cb(null, `${uniqueId}.json`);
        }
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'video') {
            const allowedTypes = /mp4|webm|mov/;
            const ext = path.extname(file.originalname).toLowerCase().slice(1);
            if (allowedTypes.test(ext)) {
                cb(null, true);
            } else {
                cb(new Error('Only video files (mp4, webm, mov) are allowed'));
            }
        } else if (file.fieldname === 'gps') {
            if (file.mimetype === 'application/json') {
                cb(null, true);
            } else {
                cb(new Error('GPS data must be a JSON file'));
            }
        } else {
            cb(null, true);
        }
    },
});

// GET /api/videos - List all videos
router.get('/', async (req, res) => {
    try {
        const files = await fs.readdir(VIDEOS_DIR);
        const videos = [];

        for (const file of files) {
            const ext = path.extname(file);
            const videoId = path.basename(file, ext);
            const filePath = path.join(VIDEOS_DIR, file);
            const stats = await fs.stat(filePath);

            // Check if GPS data exists
            const gpsPath = path.join(GPS_DIR, `${videoId}.json`);
            const hasGPS = existsSync(gpsPath);

            const nameLower = file.toLowerCase();
            const is360 = nameLower.includes('panorama') || nameLower.includes('360') || nameLower.includes('equirectangular');

            videos.push({
                id: videoId,
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime,
                hasGPS,
                is360,
            });
        }

        res.json(videos);
    } catch (error) {
        console.error('Error listing videos:', error);
        res.status(500).json({ error: 'Failed to list videos' });
    }
});

// GET /api/videos/:id/stream - Stream video file
router.get('/:id/stream', async (req, res) => {
    try {
        const { id } = req.params;
        const files = await fs.readdir(VIDEOS_DIR);
        const videoFile = files.find(f => f.startsWith(id));

        if (!videoFile) {
            return res.status(404).json({ error: 'Video not found' });
        }

        const videoPath = path.join(VIDEOS_DIR, videoFile);
        const stat = await fs.stat(videoPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            const file = createReadStream(videoPath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };

            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            createReadStream(videoPath).pipe(res);
        }
    } catch (error) {
        console.error('Error streaming video:', error);
        res.status(500).json({ error: 'Failed to stream video' });
    }
});

// GET /api/videos/:id/gps - Get GPS data for video
router.get('/:id/gps', async (req, res) => {
    try {
        const { id } = req.params;
        const gpsPath = path.join(GPS_DIR, `${id}.json`);

        if (!existsSync(gpsPath)) {
            return res.status(404).json({ error: 'GPS data not found' });
        }

        const gpsData = await fs.readFile(gpsPath, 'utf-8');
        res.json(JSON.parse(gpsData));
    } catch (error) {
        console.error('Error fetching GPS data:', error);
        res.status(500).json({ error: 'Failed to fetch GPS data' });
    }
});

// POST /api/videos/upload - Upload video and optional GPS data
router.post('/upload', upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'gps', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files || !req.files.video) {
            return res.status(400).json({ error: 'No video file provided' });
        }

        const videoFile = req.files.video[0];
        const videoId = path.basename(videoFile.filename, path.extname(videoFile.filename));

        const nameLower = videoFile.filename.toLowerCase();
        const is360 = nameLower.includes('panorama') || nameLower.includes('360') || nameLower.includes('equirectangular');

        const response = {
            videoId,
            filename: videoFile.filename,
            size: videoFile.size,
            hasGPS: false,
            is360,
        };

        if (req.files.gps) {
            response.hasGPS = true;
        }

        res.json(response);
    } catch (error) {
        console.error('Error uploading video:', error);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

// DELETE /api/videos/:id - Delete video and GPS data
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const files = await fs.readdir(VIDEOS_DIR);
        const videoFile = files.find(f => f.startsWith(id));

        if (!videoFile) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Delete video file
        const videoPath = path.join(VIDEOS_DIR, videoFile);
        await fs.unlink(videoPath);

        // Delete GPS data if exists
        const gpsPath = path.join(GPS_DIR, `${id}.json`);
        if (existsSync(gpsPath)) {
            await fs.unlink(gpsPath);
        }

        res.json({ message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: 'Failed to delete video' });
    }
});

export default router;
