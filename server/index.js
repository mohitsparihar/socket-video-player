import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
// Allow Vite dev (localhost + network IP) and production origin
app.use(cors({ origin: true, credentials: true }));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

// roomId -> { adminId, users, videoId?, currentTime?, isPlaying?, mapCenter?, mapZoom?, spherical? }
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      adminId: null,
      users: [],
      videoId: null,
      currentTime: 0,
      isPlaying: false,
      mapCenter: { lat: 40.758, lng: -73.9855 },
      mapZoom: 13,
      spherical: null,
    });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userName }) => {
    const room = getOrCreateRoom(roomId);
    // Avoid duplicate entries if join-room is sent twice (e.g. React StrictMode)
    room.users = room.users.filter((u) => u.id !== socket.id);
    const isFirst = room.users.length === 0;
    const user = { id: socket.id, name: userName || `User ${socket.id.slice(0, 6)}` };
    room.users.push(user);

    if (isFirst) {
      room.adminId = socket.id;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = user.name;
    socket.isAdmin = room.adminId === socket.id;

    socket.emit('joined', {
      roomId,
      isAdmin: socket.isAdmin,
      userName: user.name,
      videoId: room.videoId,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      mapCenter: room.mapCenter,
      mapZoom: room.mapZoom,
      spherical: room.spherical,
    });

    io.to(roomId).emit('users-update', {
      users: room.users,
      adminId: room.adminId,
    });
  });

  socket.on('set-video', ({ roomId, videoId }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    room.videoId = videoId;
    io.to(roomId).emit('video-changed', { videoId });
  });

  socket.on('play', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    room.currentTime = currentTime;
    room.isPlaying = true;
    socket.to(roomId).emit('play', { currentTime });
  });

  socket.on('pause', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    room.currentTime = currentTime;
    room.isPlaying = false;
    socket.to(roomId).emit('pause', { currentTime });
  });

  socket.on('sync-seek', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    room.currentTime = currentTime;
    socket.to(roomId).emit('sync-seek', { currentTime });
  });

  socket.on('heartbeat', ({ roomId, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    room.currentTime = currentTime;
    socket.to(roomId).emit('heartbeat', { currentTime });
  });

  socket.on('spherical-update', ({ roomId, spherical }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    if (spherical && typeof spherical === 'object' && Object.keys(spherical).length > 0) {
      room.spherical = spherical;
      socket.to(roomId).emit('spherical-update', { spherical });
    }
  });

  socket.on('map-update', ({ roomId, mapCenter, mapZoom }) => {
    const room = rooms.get(roomId);
    if (!room || room.adminId !== socket.id) return;
    if (
      mapCenter &&
      typeof mapCenter.lat === 'number' &&
      typeof mapCenter.lng === 'number'
    ) {
      room.mapCenter = mapCenter;
    }
    room.mapZoom = Number.isFinite(mapZoom) ? mapZoom : room.mapZoom;
    socket.to(roomId).emit('map-update', { mapCenter: room.mapCenter, mapZoom: room.mapZoom });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.users = room.users.filter((u) => u.id !== socket.id);

    if (room.adminId === socket.id && room.users.length > 0) {
      room.adminId = room.users[0].id;
      io.to(room.users[0].id).emit('you-are-admin');
      io.to(roomId).emit('users-update', {
        users: room.users,
        adminId: room.adminId,
      });
    } else if (room.users.length === 0) {
      rooms.delete(roomId);
    } else {
      io.to(roomId).emit('users-update', {
        users: room.users,
        adminId: room.adminId,
      });
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});
