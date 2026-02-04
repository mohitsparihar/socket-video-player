import { Users, Crown } from 'lucide-react';

export default function Sidebar({ users = [], adminId, roomId }) {
  return (
    <aside className="w-64 border-l border-cinema-border bg-cinema-panel flex flex-col shrink-0">
      <div className="p-4 border-b border-cinema-border">
        <div className="flex items-center gap-2 text-cinema-silver">
          <Users className="w-5 h-5" />
          <span className="font-medium">Viewers</span>
        </div>
        <p className="text-xs text-cinema-muted mt-1">Share the room link to invite</p>
      </div>
      <ul className="flex-1 overflow-y-auto p-3 space-y-1">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cinema-dark border border-cinema-border"
          >
            {user.id === adminId ? (
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-cinema-border shrink-0" />
            )}
            <span className="text-sm truncate">{user.name}</span>
            {user.id === adminId && (
              <span className="text-xs text-amber-400 ml-auto">Host</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
