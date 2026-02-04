import { Outlet } from 'react-router';

export default function Root() {
  return (
    <div className="min-h-screen bg-cinema-black text-white">
      <Outlet />
    </div>
  );
}
