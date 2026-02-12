import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useLocation, useNavigate, Link } from 'react-router';
import { useSocket } from '../context/SocketContext';
import Custom360Player from '../components/Custom360Player';
import MapPanel from '../components/MapPanel';
import VideoCallPanel from '../components/VideoCallPanel';
import { ArrowLeft, Crown, Share2, Upload, Video, Film, Globe, Map, Phone } from 'lucide-react';
import { getVideoUrl, getVideoListFromCameraApi, uploadVideo, getGPSData, getGPSDataFromUrl, interpolateGPSPosition } from '../utils/video';

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
  const [joined, setJoined] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [cameraVideo, setCameraVideo] = useState(null);
  const [remoteTime, setRemoteTime] = useState(0);
  const [remotePlaying, setRemotePlaying] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.758, lng: -73.9855 });
  const [mapZoom, setMapZoom] = useState(16);
  const [remoteSpherical, setRemoteSpherical] = useState(null);

  // New states for custom video player
  const [videoList, setVideoList] = useState([]);
  const [gpsData, setGpsData] = useState(null);
  const [currentPosition, setCurrentPosition] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState('videos'); // 'videos' | 'map' | 'videoCall'
  const [localTime, setLocalTime] = useState(0); // Track admin's local video time

  // Non-admins don't have Videos tab; default to Map
  useEffect(() => {
    if (joined && !isAdmin && rightPanelTab === 'videos') {
      setRightPanelTab('map');
    }
  }, [joined, isAdmin, rightPanelTab]);

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
      if (data.cameraVideo) setCameraVideo(data.cameraVideo);
      if (data.gpsData) setGpsData(data.gpsData);
    });

    socket.on('you-are-admin', () => setIsAdmin(true));

    socket.on('video-changed', ({ videoId: v, cameraVideo: cv, gpsData: gps }) => {
      setVideoId(v);
      if (cv) setCameraVideo(cv);
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
        if (data?.gpsData?.length) setMapCenter({ lat: data.gpsData[0].lat, lng: data.gpsData[0].lng });
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
      // Update map center to follow current position
      setMapCenter(position);
    }
  }, [isAdmin, localTime, remoteTime, gpsData]);

  // Load GPS when video changes (only for local videos; camera videos load GPS in handleSetVideo / state effect)
  useEffect(() => {
    if (!videoId) return;
    const v = videoList.find((x) => (x.id ?? x.videoId) === videoId);
    if (v?.public_url) return;
    loadGPSData(videoId);
  }, [videoId, videoList]);

  const handleSetVideo = async (selectedVideoId) => {
    if (!selectedVideoId || !socket || !isAdmin || !roomId) return;

    // Reset current position and time when changing videos
    setCurrentPosition(null);
    setRemoteTime(0);
    setLocalTime(0);

    const video = videoList.find((v) => (v.id ?? v.videoId) === selectedVideoId);
    if (video?.public_url) {
      setCameraVideo(video);
      setVideoId(selectedVideoId);
      setUrlInput('');
      const data = await getGPSDataFromUrl(video.gps_json_url);
      setGpsData(data);
      if (data?.gpsData?.length) {
        const first = data.gpsData[0];
        setMapCenter({ lat: first.lat, lng: first.lng });
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
    }
    return data;
  };

  const handleVideoUpload = async (e) => {
    const videoFile = e.target.files?.[0];
    if (!videoFile) return;

    setUploading(true);
    try {
      const result = await uploadVideo(videoFile);
      setVideoList([...videoList, result]);
      setShowUpload(false);
      // Optionally auto-select the uploaded video
      handleSetVideo(result.videoId);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload video');
    } finally {
      setUploading(false);
    }
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

  // No name yet: show Jitsi as the single join flow. Joining Jitsi will auto-join the video room.
  if (!joined && !displayName) {
    return (
      <div className="min-h-screen flex flex-col bg-cinema-black">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cinema-border bg-cinema-dark shrink-0">
          <Link
            to="/"
            className="p-2 rounded-lg text-cinema-muted hover:text-white hover:bg-cinema-panel transition-colors"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="text-cinema-muted font-mono text-sm">Room: {roomId}</span>
          <span className="text-cinema-muted text-sm">Join the video call to participate</span>
        </div>
        <div className="flex-1 min-h-0">
          <VideoCallPanel
            roomId={roomId}
            displayName=""
            onJitsiJoined={(name) => setDisplayName(name || 'Guest')}
          />
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
              <Video className="w-4 h-4 text-cinema-muted shrink-0" />
              <select
                value={videoId || ''}
                onChange={(e) => handleSetVideo(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-cinema-panel border border-cinema-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
              >
                <option value="">Select a 360° video...</option>
                {videoList.map((video) => (
                  <option key={video.id ?? video.videoId} value={video.id ?? video.videoId}>
                    {video.filename} {video.hasGPS && '📍'}
                  </option>
                ))}
              </select>
              <label className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Upload'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleVideoUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </header>

        <div className="flex-1 flex min-h-0">
          <div className="basis-[70%] flex flex-col items-center justify-center p-6 min-w-0">
            <div className="relative w-full max-w-4xl">
              <Custom360Player
                ref={playerRef}
                videoUrl={cameraVideo?.public_url ?? (videoId ? getVideoUrl(videoId) : null)}
                isAdmin={isAdmin}
                is360={cameraVideo ? true : (videoList.find((v) => (v.id ?? v.videoId) === videoId)?.is360 ?? true)}
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
                <div className="absolute inset-0 flex items-center justify-center text-center text-cinema-muted">
                  {isAdmin ? (
                    <p>Select a 360° video from the dropdown above or upload a new one to start.</p>
                  ) : (
                    <p>Waiting for the host to load a video...</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="basis-[30%] border-l border-cinema-border bg-cinema-panel flex flex-col min-h-0 min-w-0">
            {/* Tabs: Video library (admin only) | Map | Video Call */}
            <div className="flex border-b border-cinema-border shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setRightPanelTab('videos')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                    rightPanelTab === 'videos'
                      ? 'bg-cinema-dark text-white border-b-2 border-red-500'
                      : 'text-cinema-muted hover:text-white hover:bg-cinema-dark/50'
                  }`}
                >
                  <Film className="w-4 h-4" />
                  Videos
                </button>
              )}
              <button
                type="button"
                onClick={() => setRightPanelTab('map')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === 'map'
                    ? 'bg-cinema-dark text-white border-b-2 border-red-500'
                    : 'text-cinema-muted hover:text-white hover:bg-cinema-dark/50'
                }`}
              >
                <Map className="w-4 h-4" />
                Map
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab('videoCall')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === 'videoCall'
                    ? 'bg-cinema-dark text-white border-b-2 border-red-500'
                    : 'text-cinema-muted hover:text-white hover:bg-cinema-dark/50'
                }`}
              >
                <Phone className="w-4 h-4" />
                Video Call
              </button>
            </div>

            {isAdmin && rightPanelTab === 'videos' && (
              <div className="flex-1 overflow-y-auto p-3">
                {isAdmin ? (
                  <>
                    <p className="text-cinema-muted text-xs mb-3">
                      Click a video to play it in the room.
                    </p>
                    {videoList.length === 0 ? (
                      <p className="text-cinema-muted text-sm">No videos yet. Upload from the header.</p>
                    ) : (
                      <ul className="space-y-2">
                        {videoList.map((video) => (
                          <li key={video.id}>
                            <button
                              type="button"
                              onClick={() => handleSetVideo(video.id)}
                              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                                videoId === video.id
                                  ? 'border-red-500 bg-red-500/10 text-white'
                                  : 'border-cinema-border bg-cinema-dark hover:border-cinema-muted hover:bg-cinema-dark/80 text-cinema-silver'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-10 h-10 rounded bg-cinema-black flex items-center justify-center">
                                  <Film className="w-5 h-5 text-cinema-muted" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-mono truncate" title={video.filename}>
                                    {video.filename}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {video.is360 && (
                                      <span className="inline-flex items-center gap-0.5 text-amber-400 text-xs">
                                        <Globe className="w-3 h-3" />
                                        360°
                                      </span>
                                    )}
                                    {video.hasGPS && <span className="text-xs text-cinema-muted">📍 GPS</span>}
                                  </div>
                                </div>
                                {videoId === video.id && (
                                  <span className="text-xs text-red-400 font-medium shrink-0">Playing</span>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className="w-16 h-16 rounded-full bg-cinema-dark border border-cinema-border flex items-center justify-center mb-4">
                      <Film className="w-8 h-8 text-cinema-muted" />
                    </div>
                    <h3 className="text-white font-medium mb-2">Video Control</h3>
                    <p className="text-cinema-muted text-sm max-w-xs">
                      Only the host can select and control videos. The current video will play automatically for all viewers.
                    </p>
                    {videoId && (
                      <div className="mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-400">Currently playing</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {rightPanelTab === 'videoCall' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <VideoCallPanel roomId={roomId} displayName={userName} />
              </div>
            )}

            {rightPanelTab === 'map' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <MapPanel
                  center={mapCenter}
                  zoom={mapZoom}
                  isAdmin={isAdmin}
                  onUpdate={handleMapUpdate}
                  gpsData={gpsData}
                  currentPosition={currentPosition}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
