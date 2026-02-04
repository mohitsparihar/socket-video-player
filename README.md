# YouTube Co-browse Player

A real-time synchronized YouTube player. One **Admin** controls playback; all **Viewers** stay in sync via WebSockets.

## Tech Stack

- **Frontend:** React (Vite), React Router v7, Tailwind CSS, Lucide React
- **Video:** YouTube IFrame API (react-youtube)
- **Real-time:** Socket.io (client + server)
- **State:** React Hooks

## Features

- **Rooms:** Create a room or join with a Room ID
- **Roles:** First user is Admin; only Admin can play, pause, seek, or change video
- **Sync:** Admin actions broadcast to Viewers; heartbeat every 3s with drift correction (re-sync if >2s off)
- **UI:** Dark cinema theme, sidebar with connected users, Admin-only YouTube URL input

## Setup

1. Install root (client) dependencies:
   ```bash
   npm install
   ```

2. Install server dependencies:
   ```bash
   cd server && npm install && cd ..
   ```

3. Run both client and server:
   ```bash
   npm run dev
   ```
   - Client: http://localhost:5173  
   - Socket.io server: http://localhost:3001  

4. Create a room, share the Room ID, and paste a YouTube URL (Admin only). Viewers join with the same Room ID.

## Access from another device (same WiFi)

The dev server is started with `--host`, so it listens on all interfaces.

1. On the **laptop running the app**, find your local IP:
   - **macOS:** System Settings → Network → Wi‑Fi → Details, or run: `ipconfig getifaddr en0`
   - **Windows:** `ipconfig` and look for "IPv4 Address" under your Wi‑Fi adapter
2. On the **other laptop/phone**, open a browser and go to: **`http://YOUR_IP:5173`**  
   Example: `http://192.168.1.5:5173`
3. Join the same room using the Room ID. Socket.io is proxied through Vite, so no extra setup is needed.

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm run dev`  | Start Vite + Socket.io server  |
| `npm run build`| Build client for production    |
| `npm run preview` | Preview production build   |

## Project Structure

```
video-player/
├── index.html
├── package.json          # Client deps + scripts
├── src/
│   ├── main.jsx          # React Router v7 + SocketProvider
│   ├── index.css         # Tailwind
│   ├── context/
│   │   └── SocketContext.jsx
│   ├── routes/
│   │   ├── Root.jsx
│   │   ├── Home.jsx       # Create / Join room
│   │   └── Room.jsx       # Player + sidebar
│   ├── components/
│   │   ├── YouTubePlayer.jsx
│   │   └── Sidebar.jsx
│   └── utils/
│       └── youtube.js     # Parse YouTube URL → video ID
└── server/
    ├── package.json
    └── index.js          # Express + Socket.io
```
