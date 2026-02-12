import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Film, Plus, Video } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

  const handleCreateRoom = (e) => {
    e.preventDefault();
    const name = userName.trim() || 'Host';
    const roomId = crypto.randomUUID().slice(0, 8);
    navigate(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-cinema-black">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-10">
          <Film className="w-12 h-12 text-red-500" />
          <h1 className="text-3xl font-bold tracking-tight">Co-browse Player</h1>
        </div>
        <p className="text-cinema-muted text-center mb-8">
          Create a room, then share the link. Others join with their name—no Room ID needed.
        </p>

        <Link
          to="/videos"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-cinema-panel border border-cinema-border text-cinema-silver hover:text-white hover:border-cinema-muted transition-colors mb-6"
        >
          <Video className="w-5 h-5" />
          Browse video library
        </Link>

        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-cinema-silver mb-1.5">
              Your name
            </label>
            <input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-lg bg-cinema-dark border border-cinema-border text-white placeholder-cinema-muted focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
            />
          </div>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create room
          </button>
        </form>
      </div>
    </div>
  );
}
