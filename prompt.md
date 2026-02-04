Act as an expert Senior Full-Stack Engineer and Web Application Architect. 

### Goal
Create a real-time synchronized YouTube Co-browse Player. One "Admin" controls the video, and all "Viewers" stay perfectly in sync.

### Tech Stack
- Frontend: Next.js (App Router), Tailwind CSS, Lucide React (for icons)
- Video Engine: YouTube IFrame Player API (via `react-youtube` library)
- Real-time: Socket.io (Client and Server)
- State Management: React Hooks

### Core Requirements
1. **Session System:** A user can create a "Room" or join an existing one via a Room ID.
2. **Role Logic:** The first user to join is the "Admin." Only the Admin can play, pause, or seek. Others are "Viewers" whose players are locked to the Admin's state.
3. **The Player:**
   - Integrate the YouTube IFrame API.
   - On Admin play/pause/seek: Emit a WebSocket event with the action and current timestamp.
   - On Viewer receive: Use `seekTo(timestamp)` and `playVideo()` / `pauseVideo()` to match the Admin.
4. **Drift Correction:** Implement a "Heartbeat" where the Admin broadcasts their current time every 3 seconds. If a Viewer is more than 2 seconds out of sync, force a re-sync.
5. **UI/UX:**
   - A clean, dark-themed "Cinema" layout using Tailwind.
   - A sidebar showing connected users.
   - An input field to paste a YouTube URL (Admin only).

### Implementation Steps
1. Setup a Next.js frontend with a basic Socket.io server integration.
2. Create the YouTube player component.
3. Implement the WebSocket event listeners for 'play', 'pause', and 'sync-seek'.
4. Ensure Viewers cannot manually control the player (overlay the player with a transparent div if necessary, or use API event prevention).

Please start by providing the folder structure and the initial Socket.io server setup.