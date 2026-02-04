import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router';
import { useSocket } from '../context/SocketContext';
import YouTubePlayer from '../components/YouTubePlayer';
import MapPanel from '../components/MapPanel';
import { ArrowLeft, Crown, Link2, Share2, LogIn } from 'lucide-react';
import { getYouTubeVideoId } from '../utils/youtube';

const HEARTBEAT_INTERVAL_MS = 3000;
const SYNC_THRESHOLD_SEC = 2;

export default function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const nameFromUrl = searchParams.get('name') ?? '';
  const socket = useSocket();

  const [displayName, setDisplayName] = useState(nameFromUrl);
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [remoteTime, setRemoteTime] = useState(0);
  const [remotePlaying, setRemotePlaying] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [joinNameInput, setJoinNameInput] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.758, lng: -73.9855 });
  const [mapZoom, setMapZoom] = useState(13);
  const [remoteSpherical, setRemoteSpherical] = useState(null);

  const playerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const lastSyncRef = useRef(0);

  const userName = displayName || 'User';

  const emitPlay = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        socket.emit('play', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitPause = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        socket.emit('pause', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitSeek = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        socket.emit('sync-seek', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitHeartbeat = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        socket.emit('heartbeat', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitSpherical = useCallback(
    (spherical) => {
      if (socket && isAdmin && roomId && spherical && Object.keys(spherical).length > 0) {
        socket.emit('spherical-update', { roomId, spherical });
      }
    },
    [socket, isAdmin, roomId]
  );

  useEffect(() => {
    if (!socket || !roomId || !displayName) return;

    socket.emit('join-room', { roomId, userName: displayName });

    socket.on('joined', (data) => {
      setJoined(true);
      setIsAdmin(data.isAdmin);
      setVideoId(data.videoId || null);
      setRemoteTime(data.currentTime ?? 0);
      setRemotePlaying(data.isPlaying ?? false);
      if (data.mapCenter) setMapCenter(data.mapCenter);
      if (Number.isFinite(data.mapZoom)) setMapZoom(data.mapZoom);
      if (data.spherical && Object.keys(data.spherical).length > 0) setRemoteSpherical(data.spherical);
    });

    socket.on('you-are-admin', () => setIsAdmin(true));

    socket.on('video-changed', ({ videoId: v }) => setVideoId(v));

    socket.on('map-update', ({ mapCenter: c, mapZoom: z }) => {
      if (c) setMapCenter(c);
      if (Number.isFinite(z)) setMapZoom(z);
    });

    socket.on('play', ({ currentTime }) => {
      setRemoteTime(currentTime);
      setRemotePlaying(true);
      lastSyncRef.current = currentTime;
    });

    socket.on('pause', ({ currentTime }) => {
      setRemoteTime(currentTime);
      setRemotePlaying(false);
      lastSyncRef.current = currentTime;
    });

    socket.on('sync-seek', ({ currentTime }) => {
      setRemoteTime(currentTime);
      lastSyncRef.current = currentTime;
    });

    socket.on('heartbeat', ({ currentTime }) => {
      setRemoteTime(currentTime);
      lastSyncRef.current = currentTime;
    });

    socket.on('spherical-update', ({ spherical }) => {
      if (spherical && Object.keys(spherical).length > 0) setRemoteSpherical(spherical);
    });

    return () => {
      socket.off('joined');
      socket.off('you-are-admin');
      socket.off('video-changed');
      socket.off('map-update');
      socket.off('play');
      socket.off('pause');
      socket.off('sync-seek');
      socket.off('heartbeat');
      socket.off('spherical-update');
    };
  }, [socket, roomId, displayName]);

  useEffect(() => {
    if (!isAdmin || !playerRef.current) return;

    const interval = setInterval(() => {
      const player = playerRef.current?.getInternalPlayer?.();
      if (player && typeof player.getCurrentTime === 'function') {
        try {
          const t = player.getCurrentTime();
          emitHeartbeat(t);
        } catch (_) {}
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAdmin, emitHeartbeat]);

  const handleSetVideo = () => {
    const id = getYouTubeVideoId(urlInput);
    if (id && socket && isAdmin && roomId) {
      socket.emit('set-video', { roomId, videoId: id });
      setVideoId(id);
      setUrlInput('');
    }
  };

  const handleMapUpdate = ({ mapCenter: c, mapZoom: z }) => {
    if (c) setMapCenter(c);
    if (Number.isFinite(z)) setMapZoom(z);
    if (socket && isAdmin && roomId) {
      socket.emit('map-update', { roomId, mapCenter: c, mapZoom: z });
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    const name = joinNameInput.trim() || 'Viewer';
    setDisplayName(name);
  };

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const socketStatus =
    socket === undefined ? 'loading' : socket === null ? 'connecting' : 'ready';
  if (socketStatus !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cinema-black">
        <div className="text-cinema-muted">
          {socketStatus === 'loading' ? 'Loading...' : 'Connecting...'}
        </div>
      </div>
    );
  }

  if (!joined && !displayName) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-cinema-black">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-center mb-2">Join this meeting</h2>
          <p className="text-cinema-muted text-center text-sm mb-6">
            Enter your name to join the room.
          </p>
          <form onSubmit={handleJoinMeeting} className="space-y-4">
            <input
              type="text"
              value={joinNameInput}
              onChange={(e) => setJoinNameInput(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-lg bg-cinema-dark border border-cinema-border text-white placeholder-cinema-muted focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
              autoFocus
            />
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
            >
              <LogIn className="w-5 h-5" />
              Join meeting
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cinema-black">
        <div className="text-cinema-muted">Joining room...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-cinema-black overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-cinema-border bg-cinema-dark shrink-0">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="p-2 rounded-lg text-cinema-muted hover:text-white hover:bg-cinema-panel transition-colors"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-cinema-muted font-mono text-sm">Room: {roomId}</span>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cinema-panel border border-cinema-border text-cinema-silver hover:text-white hover:border-cinema-muted transition-colors text-sm"
                  title="Copy join link"
                >
                  <Share2 className="w-4 h-4" />
                  {linkCopied ? 'Copied!' : 'Copy link'}
                </button>
                <span className="flex items-center gap-1.5 text-amber-400 text-sm">
                  <Crown className="w-4 h-4" />
                  Admin
                </span>
              </>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-1 max-w-xl ml-4">
              <Link2 className="w-4 h-4 text-cinema-muted shrink-0" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetVideo()}
                placeholder="Paste YouTube URL (Admin only)"
                className="flex-1 px-3 py-2 rounded-lg bg-cinema-panel border border-cinema-border text-white placeholder-cinema-muted text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
              <button
                type="button"
                onClick={handleSetVideo}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                Load
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 flex min-h-0">
          <div className="basis-[70%] flex flex-col items-center justify-center p-6 min-w-0">
            {videoId ? (
              <div className="w-full max-w-4xl">
                <YouTubePlayer
                  ref={playerRef}
                  videoId={videoId}
                  isAdmin={isAdmin}
                  remoteTime={remoteTime}
                  remotePlaying={remotePlaying}
                  remoteSpherical={remoteSpherical}
                  onPlay={emitPlay}
                  onPause={emitPause}
                  onSeek={emitSeek}
                  onSphericalChange={emitSpherical}
                  syncThresholdSec={SYNC_THRESHOLD_SEC}
                />
              </div>
            ) : (
              <div className="text-center text-cinema-muted py-12">
                {isAdmin ? (
                  <p>Paste a YouTube URL above and click Load to start.</p>
                ) : (
                  <p>Waiting for the host to load a video...</p>
                )}
              </div>
            )}
          </div>
          <div className="basis-[30%] border-l border-cinema-border bg-cinema-panel flex flex-col min-h-0">
            <MapPanel
              center={mapCenter}
              zoom={mapZoom}
              isAdmin={isAdmin}
              onUpdate={handleMapUpdate}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
