import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useLocation, useNavigate, Link } from 'react-router';
import { useSocket } from '../context/SocketContext';
import Custom360Player from '../components/Custom360Player';
import MapPanel from '../components/MapPanel';
import VideoCallPanel from '../components/VideoCallPanel';
import { ArrowLeft, Crown, Share2, Film, Map, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import { getVideoUrl, getVideoListFromCameraApi, getGPSData, getGPSDataFromUrl, interpolateGPSPosition } from '../utils/video';

const HEARTBEAT_INTERVAL_MS = 3000;
const SYNC_THRESHOLD_SEC = 2;

export default function Room() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const nameFromUrl = searchParams.get('name') ?? '';
  const socket = useSocket();

  const [displayName, setDisplayName] = useState(nameFromUrl);
  const [jitsiJoined, setJitsiJoined] = useState(false);
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [cameraVideo, setCameraVideo] = useState(null);
  const [remoteTime, setRemoteTime] = useState(0);
  const [remotePlaying, setRemotePlaying] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 20.5937, lng: 78.9629 });
  const [mapZoom, setMapZoom] = useState(5);
  const [remoteSpherical, setRemoteSpherical] = useState(null);

  // New states for custom video player
  const [videoList, setVideoList] = useState([]);
  const [gpsData, setGpsData] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [localTime, setLocalTime] = useState(0); // Track admin's local video time
  const [videoSharingEnabled, setVideoSharingEnabled] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const playerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const lastSyncRef = useRef(0);
  const initialVideoAppliedRef = useRef(false);

  const userName = displayName || 'User';

  const emitPlay = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        setLocalTime(currentTime); // Update admin's local time
        socket.emit('play', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitPause = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        setLocalTime(currentTime); // Update admin's local time
        socket.emit('pause', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitSeek = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        setLocalTime(currentTime); // Update admin's local time
        socket.emit('sync-seek', { roomId, currentTime });
      }
    },
    [socket, isAdmin, roomId]
  );

  const emitHeartbeat = useCallback(
    (currentTime) => {
      if (socket && isAdmin && roomId) {
        setLocalTime(currentTime); // Update admin's local time
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
    if (!socket || !roomId || !displayName || !jitsiJoined) return;

    socket.emit('join-room', { roomId, userName: displayName });

    socket.on('joined', (data) => {
      setJoined(true);
      setIsAdmin(data.isAdmin);
      setVideoId(data.videoId || null);
      setRemoteTime(data.currentTime ?? 0);
      setRemotePlaying(data.isPlaying ?? false);
      const isOldDefaultCenter = data.mapCenter && Math.abs(data.mapCenter.lat - 40.758) < 0.001 && Math.abs(data.mapCenter.lng - -73.9855) < 0.001;

      if (data.mapCenter && !isOldDefaultCenter) {
        setMapCenter(data.mapCenter);
      }

      if (Number.isFinite(data.mapZoom)) {
        // HACK: If server sends old default zoom (13) with old default center, ignore it
        if (!(isOldDefaultCenter && data.mapZoom === 13)) {
          setMapZoom(data.mapZoom);
        }
      }

      if (data.spherical && Object.keys(data.spherical).length > 0) setRemoteSpherical(data.spherical);
      if (data.cameraVideo) setCameraVideo(data.cameraVideo);
      if (data.gpsData) setGpsData(data.gpsData);
      if (typeof data.videoSharingEnabled === 'boolean') {
        setVideoSharingEnabled(data.videoSharingEnabled);
        setShowSidebar(data.videoSharingEnabled);
      }
    });

    socket.on('you-are-admin', () => setIsAdmin(true));

    socket.on('video-changed', ({ videoId: v, cameraVideo: cv, gpsData: gps }) => {
      setVideoId(v);
      setCameraVideo(cv || null);
      if (gps) setGpsData(gps);
      // Reset current position when video changes for non-admin users
      setCurrentPosition(null);
    });

    socket.on('gps-data-update', ({ gpsData: gps }) => {
      if (gps) setGpsData(gps);
    });

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

    socket.on('video-sharing-toggled', ({ enabled }) => {
      setVideoSharingEnabled(enabled);
      setShowSidebar(enabled);
    });

    return () => {
      socket.off('joined');
      socket.off('you-are-admin');
      socket.off('video-changed');
      socket.off('gps-data-update');
      socket.off('map-update');
      socket.off('play');
      socket.off('pause');
      socket.off('sync-seek');
      socket.off('heartbeat');
      socket.off('spherical-update');
      socket.off('video-sharing-toggled');
    };
  }, [socket, roomId, displayName, jitsiJoined]);

  useEffect(() => {
    if (!isAdmin || !playerRef.current) return;

    const interval = setInterval(() => {
      const player = playerRef.current?.getInternalPlayer?.();
      if (player && typeof player.getCurrentTime === 'function') {
        try {
          const t = player.getCurrentTime();
          emitHeartbeat(t);
        } catch (_) { }
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAdmin, emitHeartbeat]);

  // Load video list from camera app API
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const videos = await getVideoListFromCameraApi();
        setVideoList(Array.isArray(videos) ? videos : []);
      } catch (err) {
        console.error('Failed to load video list:', err);
        setVideoList([]);
      }
    };
    loadVideos();
  }, []);

  const cameraVideoFromStateAppliedRef = useRef(false);
  // When landing with cameraVideo from Videos page, set it and clear location state
  useEffect(() => {
    if (cameraVideoFromStateAppliedRef.current) return;
    const fromState = location.state?.cameraVideo;
    if (!fromState?.public_url) return;
    cameraVideoFromStateAppliedRef.current = true;
    setCameraVideo(fromState);
    setVideoId(fromState.filename ?? null);
    setGpsData(null);
    getGPSDataFromUrl(fromState.gps_json_url).then((data) => {
      setGpsData(data);
      if (data?.gpsData?.length) {
        const first = data.gpsData[0];
        setMapCenter({ lat: first.lat, lng: first.lng });
      }
      // Broadcast to room if admin
      if (socket && isAdmin && roomId) {
        socket.emit('set-video', {
          roomId,
          videoId: fromState.filename,
          cameraVideo: fromState,
          gpsData: data
        });
      }
    });
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate, socket, isAdmin, roomId]);

  // When admin joins with ?videoId= in URL, set that video for the room (once)
  const initialVideoIdFromUrl = searchParams.get('videoId');
  useEffect(() => {
    if (!joined || !isAdmin || !initialVideoIdFromUrl || !socket || !roomId) return;
    if (initialVideoAppliedRef.current) return;
    initialVideoAppliedRef.current = true;
    const video = videoList.find((v) => (v.id ?? v.videoId) === initialVideoIdFromUrl);
    if (video?.public_url) {
      setCameraVideo(video);
      setVideoId(initialVideoIdFromUrl);
      getGPSDataFromUrl(video.gps_json_url).then((data) => {
        setGpsData(data);
        if (data?.gpsData?.length) {
          setMapCenter({ lat: data.gpsData[0].lat, lng: data.gpsData[0].lng });
          setMapZoom(16); // Auto-zoom to street level
        }
        socket.emit('set-video', {
          roomId,
          videoId: initialVideoIdFromUrl,
          cameraVideo: video,
          gpsData: data
        });
      });
    } else {
      setVideoId(initialVideoIdFromUrl);
      loadGPSData(initialVideoIdFromUrl).then((data) => {
        socket.emit('set-video', {
          roomId,
          videoId: initialVideoIdFromUrl,
          cameraVideo: null,
          gpsData: data
        });
      });
    }
  }, [joined, isAdmin, initialVideoIdFromUrl, socket, roomId, videoList]);

  // Update GPS position based on current time (use localTime for admin, remoteTime for members)
  useEffect(() => {
    if (!gpsData || !gpsData.gpsData) return;

    const currentTime = isAdmin ? localTime : remoteTime;
    const position = interpolateGPSPosition(gpsData.gpsData, currentTime);
    if (position) {
      setCurrentPosition(position);
      // Keep members aligned to host-controlled map position.
      // Only admin should drive center updates from GPS playback.
      if (isAdmin) setMapCenter(position);
    }
  }, [isAdmin, localTime, remoteTime, gpsData]);

  // Load GPS when video changes for host only.
  // Members must use GPS pushed via socket ('joined'/'video-changed') and should not
  // fetch local GPS by videoId, which can overwrite room GPS with null.
  useEffect(() => {
    if (!isAdmin) return;
    if (!videoId) return;
    const v = videoList.find((x) => (x.id ?? x.videoId) === videoId);
    if (v?.public_url) return;
    loadGPSData(videoId);
  }, [isAdmin, videoId, videoList]);

  const handleSetVideo = async (selectedVideoId) => {
    if (!selectedVideoId || !socket || !isAdmin || !roomId) return;

    // Reset current position and time when changing videos
    setCurrentPosition(null);
    setRemoteTime(0);
    setLocalTime(0);

    // Convert selectedVideoId to match the type in videoList (handle string from select vs number from API)
    const video = videoList.find((v) => {
      const videoId = v.id ?? v.videoId;
      return videoId == selectedVideoId; // Use loose equality to handle string/number mismatch
    });
    if (video?.public_url) {
      setCameraVideo(video);
      setVideoId(selectedVideoId);
      setUrlInput('');
      const data = await getGPSDataFromUrl(video.gps_json_url);
      setGpsData(data);
      if (data?.gpsData?.length) {
        const first = data.gpsData[0];
        setMapCenter({ lat: first.lat, lng: first.lng });
        setMapZoom(16); // Auto-zoom to street level
      }
      // Broadcast camera video and GPS data to room
      socket.emit('set-video', {
        roomId,
        videoId: selectedVideoId,
        cameraVideo: video,
        gpsData: data
      });
    } else {
      setCameraVideo(null);
      setVideoId(selectedVideoId);
      setUrlInput('');
      const data = await loadGPSData(selectedVideoId);
      if (data?.gpsData?.length) {
        setMapZoom(16); // Auto-zoom to street level
      }
      // Broadcast GPS data to room
      socket.emit('set-video', {
        roomId,
        videoId: selectedVideoId,
        cameraVideo: null,
        gpsData: data
      });
    }
  };

  const loadGPSData = async (id) => {
    const data = await getGPSData(id);
    setGpsData(data);
    if (data?.gpsData?.length) {
      const first = data.gpsData[0];
      setMapCenter({ lat: first.lat, lng: first.lng });
      setMapZoom(16); // Auto-zoom to street level
    }
    return data;
  };

  const handleMapUpdate = ({ mapCenter: c, mapZoom: z }) => {
    if (c) setMapCenter(c);
    if (Number.isFinite(z)) setMapZoom(z);
    if (socket && isAdmin && roomId) {
      socket.emit('map-update', { roomId, mapCenter: c, mapZoom: z });
    }
  };

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleTogglePanel = useCallback(() => {
    const next = !showSidebar;
    setShowSidebar(next);
    if (socket && isAdmin && roomId) {
      setVideoSharingEnabled(next);
      socket.emit('video-sharing-toggle', { roomId, enabled: next });
    }
  }, [socket, isAdmin, roomId, showSidebar]);

  const socketStatus =
    socket === undefined ? 'loading' : socket === null ? 'connecting' : 'ready';
  if (socketStatus !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-bg">
        <div className="text-light-muted">
          {socketStatus === 'loading' ? 'Loading...' : 'Connecting...'}
        </div>
      </div>
    );
  }

  // Single layout that keeps VideoCallPanel mounted throughout - prevents iframe remounting
  return (
    <div className="flex h-screen bg-light-bg overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-light-border bg-white shrink-0">
          <div className="flex items-center gap-3">
            <Link
              to={joined ? "/" : "/room/retailiq-meet"}
              className="p-2 rounded-lg text-light-muted hover:text-light-text hover:bg-light-surface transition-colors"
              aria-label={joined ? "Back to home" : "Back"}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-light-muted font-mono text-sm">Room: {roomId}</span>
            {!joined && displayName && (
              <span className="text-light-muted text-sm">Joining room…</span>
            )}
            {joined && isAdmin && (
              <>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-light-border text-light-text hover:bg-light-surface transition-colors text-sm"
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
          <div className="flex items-center gap-2">
            {joined && isAdmin && (
              <button
                type="button"
                onClick={handleTogglePanel}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-light-border text-light-text hover:bg-light-surface transition-colors text-sm"
                title={showSidebar ? 'Hide video & map panel' : 'Show video & map panel'}
              >
                {showSidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                {showSidebar ? 'Hide panel' : 'Show panel'}
              </button>
            )}
          </div>
        </header>

        {/* Jitsi full width; overlay with video + map when panel shown */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          {/* Jitsi - always full width - NEVER UNMOUNTS */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
            <VideoCallPanel
              key={roomId}
              roomId={roomId}
              displayName={joined ? userName : (nameFromUrl || '')}
              videoSharingEnabled={videoSharingEnabled}
              onJitsiJoined={!joined ? (name) => {
                setDisplayName(name || 'Guest');
                setJitsiJoined(true);
              } : undefined}
              onJitsiModerator={() => socket && roomId && socket.emit('jitsi-moderator', { roomId })}
              showHeader={false}
            />
          </div>

          {/* Overlay: video (70%) + map (30%) - covers Jitsi area - only shown when joined */}
          {joined && showSidebar && (
            <div className="absolute inset-0 z-20 flex flex-col bg-white">
              {/* Header with close */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-light-border shrink-0 bg-light-surface">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-light-muted" />
                  <span className="text-sm font-medium text-light-text">Shared 360° video</span>
                  {videoSharingEnabled && (
                    <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                      Live
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleTogglePanel}
                    className="p-2 rounded-lg text-light-muted hover:text-light-text hover:bg-light-surface transition-colors"
                    title="Close overlay"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* 70% video | 30% map */}
              <div className="flex-1 min-h-0 flex overflow-hidden">
                {/* Video section - 70% */}
                <section className="w-[70%] min-w-0 flex flex-col overflow-hidden border-r border-light-border">
                  {videoSharingEnabled ? (
                    <>
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-light-border shrink-0">
                        {isAdmin ? (
                          <select
                            value={videoId || ''}
                            onChange={(e) => handleSetVideo(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-lg bg-white border border-light-border text-light-text text-sm focus:outline-none focus:ring-2 focus:ring-light-purple/50"
                          >
                            <option value="">Select a 360° video...</option>
                            {videoList.map((video) => (
                              <option key={video.id ?? video.videoId} value={video.id ?? video.videoId}>
                                {video.filename} {video.hasGPS && '📍'}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-light-muted text-sm">
                            {videoId ? `Watching: ${videoId}` : 'Waiting for host to select video...'}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-h-0 bg-black relative">
                        <Custom360Player
                          ref={playerRef}
                          videoUrl={cameraVideo?.public_url ?? (videoId ? getVideoUrl(videoId) : null)}
                          hideBigPlayButton={!videoId}
                          isAdmin={isAdmin}
                          is360={
                            cameraVideo
                              ? true
                              : (videoList.find((v) => (v.id ?? v.videoId) === videoId)?.is360 ?? true)
                          }
                          remoteTime={remoteTime}
                          remotePlaying={remotePlaying}
                          remoteSpherical={remoteSpherical}
                          onPlay={emitPlay}
                          onPause={emitPause}
                          onSeek={emitSeek}
                          onSphericalChange={emitSpherical}
                          syncThresholdSec={SYNC_THRESHOLD_SEC}
                        />
                        {!videoId && (
                          <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-light-muted text-sm">
                            {isAdmin ? (
                              <p>Select a 360° video from the dropdown above to start.</p>
                            ) : (
                              <p>Waiting for the host to load a video...</p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center px-4 text-center text-light-muted text-sm">
                      {isAdmin
                        ? 'Enable video sharing from the top bar to start a shared 360° video.'
                        : 'Waiting for the host to enable video sharing.'}
                    </div>
                  )}
                </section>

                {/* Map section - 30% */}
                <section className="w-[30%] min-w-0 flex flex-col overflow-hidden bg-light-panel">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-light-border shrink-0">
                    <Map className="w-4 h-4 text-light-muted" />
                    <span className="text-sm font-medium text-light-text">Map</span>
                  </div>
                  <div className="flex-1 min-h-0 w-full" style={{ minHeight: '200px' }}>
                    <MapPanel
                      center={mapCenter}
                      zoom={mapZoom}
                      isAdmin={isAdmin}
                      onUpdate={handleMapUpdate}
                      gpsData={gpsData}
                      currentPosition={currentPosition}
                    />
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
