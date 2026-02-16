import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { SocketProvider } from './context/SocketContext';
import './index.css';
import Root from './routes/Root';
import Room from './routes/Room';
import Videos from './routes/Videos';

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <SocketProvider>
        <Root />
      </SocketProvider>
    ),
    children: [
      { index: true, element: <Navigate to="/room/retailiq-meet" replace /> },
      { path: 'videos', element: <Videos /> },
      { path: 'room/:roomId', element: <Room /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
