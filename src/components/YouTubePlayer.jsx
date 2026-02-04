import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

const SPHERICAL_POLL_MS = 150;

function sphericalEqual(a, b) {
  if (!a !== !b) return false;
  if (!a) return true;
  const keys = ['yaw', 'pitch', 'roll', 'fov'];
  for (const k of keys) {
    const va = a[k];
    const vb = b[k];
    if (typeof va !== 'number' && typeof vb !== 'number') continue;
    if (typeof va !== 'number' || typeof vb !== 'number') return false;
    if (Math.abs(va - vb) > 0.5) return false;
  }
  return true;
}

const YouTubePlayer = forwardRef(function YouTubePlayer(
  {
    videoId,
    isAdmin,
    remoteTime,
    remotePlaying,
    remoteSpherical,
    onPlay,
    onPause,
    onSeek,
    onSphericalChange,
    syncThresholdSec = 2,
  },
  ref
) {
  const playerInstanceRef = useRef(null);
  const ignoreNextRef = useRef(false);
  const lastRemoteRef = useRef({ time: 0, playing: false });
  const lastSphericalEmittedRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getInternalPlayer: () => playerInstanceRef.current ?? null,
  }));

  const onReady = (event) => {
    playerInstanceRef.current = event.target;
  };

  useEffect(() => {
    if (isAdmin) return;
    const player = playerInstanceRef.current;
    if (!player || typeof player.seekTo !== 'function') return;

    const sync = () => {
      try {
        const current = player.getCurrentTime();
        const diff = Math.abs(current - remoteTime);
        if (diff > syncThresholdSec) {
          player.seekTo(remoteTime, true);
        }
        if (remotePlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      } catch (_) {}
    };

    sync();
    lastRemoteRef.current = { time: remoteTime, playing: remotePlaying };
  }, [isAdmin, remoteTime, remotePlaying, syncThresholdSec]);

  // Sync 360° view direction for viewers
  useEffect(() => {
    if (isAdmin) return;
    const player = playerInstanceRef.current;
    if (!player || typeof player.setSphericalProperties !== 'function') return;
    if (!remoteSpherical || Object.keys(remoteSpherical).length === 0) return;
    try {
      player.setSphericalProperties(remoteSpherical);
    } catch (_) {}
  }, [isAdmin, remoteSpherical]);

  // Admin: poll spherical view and broadcast so room stays in sync
  useEffect(() => {
    if (!isAdmin || typeof onSphericalChange !== 'function') return;
    const interval = setInterval(() => {
      const player = playerInstanceRef.current;
      if (!player || typeof player.getSphericalProperties !== 'function') return;
      try {
        const props = player.getSphericalProperties();
        if (!props || Object.keys(props).length === 0) return;
        if (!sphericalEqual(props, lastSphericalEmittedRef.current)) {
          lastSphericalEmittedRef.current = props;
          onSphericalChange(props);
        }
      } catch (_) {}
    }, SPHERICAL_POLL_MS);
    return () => clearInterval(interval);
  }, [isAdmin, onSphericalChange]);

  const opts = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      modestbranding: 1,
      rel: 0,
    },
  };

  const handleStateChange = (event) => {
    const player = event.target;
    if (ignoreNextRef.current) {
      ignoreNextRef.current = false;
      return;
    }
    if (!isAdmin) return;

    const YT = window.YT;
    const state = event.data;
    if (state === YT.PlayerState.PLAYING) {
      const t = player.getCurrentTime();
      onPlay?.(t);
    } else if (state === YT.PlayerState.PAUSED) {
      const t = player.getCurrentTime();
      onPause?.(t);
    }
  };

  const handlePlay = () => {
    if (!isAdmin) return;
    try {
      const t = playerInstanceRef.current?.getCurrentTime?.() ?? 0;
      onPlay?.(t);
    } catch (_) {}
  };

  const handlePause = () => {
    if (!isAdmin) return;
    try {
      const t = playerInstanceRef.current?.getCurrentTime?.() ?? 0;
      onPause?.(t);
    } catch (_) {}
  };

  const handleSeek = () => {
    if (!isAdmin) return;
    try {
      const t = playerInstanceRef.current?.getCurrentTime?.() ?? 0;
      onSeek?.(t);
    } catch (_) {}
  };

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black shadow-2xl">
      <div className="video-wrapper">
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={onReady}
          onStateChange={handleStateChange}
          iframeClassName="absolute inset-0 w-full h-full"
        />
      </div>
      {!isAdmin && (
        <div
          className="absolute inset-0 z-10 cursor-not-allowed"
          title="Only the host can control playback"
          aria-hidden="true"
        />
      )}
    </div>
  );
});

export default YouTubePlayer;
