import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import 'videojs-vr/dist/videojs-vr.css';
import 'videojs-vr';

const SPHERICAL_POLL_MS = 100;
const SPHERICAL_EPS = 0.002;

// videojs-vr uses OrbitControls: theta = azimuthal (yaw), phi = polar (pitch)
function sphericalEqual(a, b) {
  if (!a !== !b) return false;
  if (!a) return true;
  const yawA = a.yaw ?? a.theta;
  const yawB = b.yaw ?? b.theta;
  const pitchA = a.pitch ?? a.phi;
  const pitchB = b.pitch ?? b.phi;
  if (typeof yawA !== 'number' || typeof pitchA !== 'number') return false;
  if (typeof yawB !== 'number' || typeof pitchB !== 'number') return false;
  return Math.abs(yawA - yawB) < SPHERICAL_EPS && Math.abs(pitchA - pitchB) < SPHERICAL_EPS;
}

// Get the VR plugin instance from the player (videojs-vr exposes camera + controls3d.orbit)
function getVrInstance(player) {
  if (!player) return null;
  try {
    // Video.js stores the plugin instance; may be a function that returns the component
    const vr = typeof player.vr === 'function' ? player.vr() : player.vr;
    if (vr && vr.controls3d && vr.camera) return vr;
    // Fallback: find a child with controls3d (e.g. getChild('Vr'))
    const children = player.children_ || player.children?.() || [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (c && c.controls3d && c.camera) return c;
    }
  } catch (_) {}
  return null;
}

const Custom360Player = forwardRef(function Custom360Player(
  {
    videoUrl,
    isAdmin,
    is360 = true,
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
  const videoContainerRef = useRef(null);
  const playerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);

  const callbacksRef = useRef({ onPlay, onPause, onSeek, onSphericalChange });
  useEffect(() => {
    callbacksRef.current = { onPlay, onPause, onSeek, onSphericalChange };
  }, [onPlay, onPause, onSeek, onSphericalChange]);

  useImperativeHandle(ref, () => ({
    getInternalPlayer: () => playerRef.current ?? null,
  }));

  // Initialize Player (once on mount)
  useEffect(() => {
    if (!videoContainerRef.current) return;

    const videoElement = document.createElement('video');
    videoElement.className = 'video-js vjs-default-skin vjs-big-play-centered';
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('crossorigin', 'anonymous');

    videoContainerRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      fluid: false,
      preload: 'auto',
      aspectRatio: '16:9',
      techOrder: ['html5'],
    });

    playerRef.current = player;

    player.ready(() => {
      try {
        if (is360) {
          player.vr({
            projection: '360',
            forceCardboard: false,
            debug: false,
          });
        }
        setPlayerReady(true);
      } catch (err) {
        console.error('Failed to init VR plugin:', err);
        setPlayerReady(true);
      }
    });

    const onPlayHandler = () => {
      if (isAdmin) callbacksRef.current.onPlay?.(player.currentTime());
    };
    const onPauseHandler = () => {
      if (isAdmin) callbacksRef.current.onPause?.(player.currentTime());
    };
    const onSeekHandler = () => {
      if (isAdmin) callbacksRef.current.onSeek?.(player.currentTime());
    };

    player.on('play', onPlayHandler);
    player.on('pause', onPauseHandler);
    player.on('seeked', onSeekHandler);

    return () => {
      if (player) {
        player.dispose();
        playerRef.current = null;
        setPlayerReady(false);
      }
      if (videoContainerRef.current) {
        videoContainerRef.current.innerHTML = '';
      }
    };
  }, []);

  // Re-init VR when is360 changes (e.g. switching from 360 to flat video) — optional; usually videoUrl change handles new source
  const is360Ref = useRef(is360);
  is360Ref.current = is360;

  // Handle URL changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || !videoUrl) return;

    player.src({
      src: videoUrl,
      type: 'video/mp4',
    });
  }, [videoUrl, playerReady]);

  // Sync time and play state for non-admin
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReady || isAdmin) return;

    const current = player.currentTime();
    const diff = Math.abs(current - remoteTime);

    if (diff > syncThresholdSec) {
      player.currentTime(remoteTime);
    }

    if (remotePlaying && player.paused()) {
      player.play().catch(() => {});
    } else if (!remotePlaying && !player.paused()) {
      player.pause();
    }
  }, [remoteTime, remotePlaying, isAdmin, playerReady, syncThresholdSec]);

  // Apply remote spherical view for non-admin (360 only). Use OrbitControls: theta = yaw, phi = pitch.
  // VR plugin inits on loadedmetadata so we retry until it's available.
  const lastSphericalAppliedRef = useRef(null);
  useEffect(() => {
    if (isAdmin || !is360 || !remoteSpherical || Object.keys(remoteSpherical).length === 0) return;
    const player = playerRef.current;
    if (!player || !playerReady) return;

    const apply = () => {
      if (sphericalEqual(remoteSpherical, lastSphericalAppliedRef.current)) return true;
      const vr = getVrInstance(player);
      const orbit = vr?.controls3d?.orbit;
      if (!orbit || typeof orbit.getAzimuthalAngle !== 'function' || typeof orbit.rotateLeft !== 'function') return false;
      const remoteTheta = remoteSpherical.yaw ?? remoteSpherical.theta;
      const remotePhi = remoteSpherical.pitch ?? remoteSpherical.phi;
      if (typeof remoteTheta !== 'number' || typeof remotePhi !== 'number') return true;
      lastSphericalAppliedRef.current = remoteSpherical;
      const currentTheta = orbit.getAzimuthalAngle();
      const currentPhi = orbit.getPolarAngle();
      orbit.rotateLeft(currentTheta - remoteTheta);
      orbit.rotateUp(currentPhi - remotePhi);
      orbit.update();
      return true;
    };

    if (apply()) return;
    const t = setInterval(() => {
      if (apply()) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, [isAdmin, is360, remoteSpherical, playerReady]);

  // Admin: poll 360 view direction (OrbitControls theta/phi) and broadcast as yaw/pitch
  const lastSphericalEmittedRef = useRef(null);
  useEffect(() => {
    if (!is360 || !isAdmin || typeof onSphericalChange !== 'function') return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !playerReady) return;
      try {
        const vr = getVrInstance(player);
        const orbit = vr?.controls3d?.orbit;
        if (!orbit || typeof orbit.getAzimuthalAngle !== 'function') return;
        const theta = orbit.getAzimuthalAngle();
        const phi = orbit.getPolarAngle();
        const spherical = { yaw: theta, pitch: phi };
        if (!sphericalEqual(spherical, lastSphericalEmittedRef.current)) {
          lastSphericalEmittedRef.current = spherical;
          callbacksRef.current.onSphericalChange?.(spherical);
        }
      } catch (_) {}
    }, SPHERICAL_POLL_MS);
    return () => clearInterval(interval);
  }, [is360, isAdmin, onSphericalChange, playerReady]);

  return (
    <div className="relative w-full h-[600px] rounded-xl overflow-hidden bg-black shadow-2xl">
      <div ref={videoContainerRef} className="w-full h-full" />

      {!isAdmin && (
        <div
          className="absolute inset-0 z-50 cursor-not-allowed"
          style={{ pointerEvents: isAdmin ? 'none' : 'all' }}
          title="Only the host can control playback"
          aria-hidden="true"
        />
      )}
    </div>
  );
});

export default Custom360Player;
