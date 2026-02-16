import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { getVideoListFromCameraApi } from '../utils/video';
import { Film, Play, ArrowLeft, Globe } from 'lucide-react';

export default function Videos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await getVideoListFromCameraApi();
        if (!cancelled) setVideos(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load videos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const playInRoom = (video, e) => {
    e.preventDefault();
    navigate(`/room/retailiq-meet?name=Host`, {
      state: {
        cameraVideo: {
          public_url: video.public_url,
          gps_json_url: video.gps_json_url ?? null,
          filename: video.filename,
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-light-bg text-light-text">
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-light-border bg-white/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/room/retailiq-meet"
            className="p-2 rounded-lg text-light-muted hover:text-light-text hover:bg-light-surface transition-colors"
            aria-label="Back to room"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold">Video library</h1>
        </div>
        <Link
          to="/room/retailiq-meet"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-light-purple hover:bg-light-purple-hover text-white text-sm font-medium transition-colors"
        >
          <Film className="w-4 h-4" />
          Join room
        </Link>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-20 text-light-muted">
            Loading videos…
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 mb-6">
            {error}
          </div>
        )}
        {!loading && !error && videos.length === 0 && (
          <div className="text-center py-20 text-light-muted">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No videos yet. Upload from a room or add files to the server.</p>
          </div>
        )}
        {!loading && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <article
                key={video.id}
                className="rounded-xl border border-light-border bg-white overflow-hidden hover:border-light-muted transition-colors"
              >
                <div className="aspect-video bg-light-surface flex items-center justify-center relative">
                  <Film className="w-16 h-16 text-light-muted/50" />
                  {video.is360 && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 text-amber-400 text-xs font-medium">
                      <Globe className="w-3 h-3" />
                      360°
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm text-light-text font-mono truncate" title={video.filename}>
                    {video.filename}
                  </p>
                  {video.hasGPS && (
                    <span className="inline-block mt-1 text-xs text-light-muted">📍 GPS</span>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={(e) => playInRoom(video, e)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-light-purple hover:bg-light-purple-hover text-white text-sm font-medium transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Play in room
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
