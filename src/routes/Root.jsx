import { Outlet } from 'react-router';

export default function Root() {
  return (
    <div className="min-h-screen bg-light-bg text-light-text">
      <Outlet />
    </div>
  );
}
