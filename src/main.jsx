import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { SocketProvider } from './context/SocketContext';
import './index.css';
import Root from './routes/Root';
import Home from './routes/Home';
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
      { index: true, element: <Home /> },
      { path: 'videos', element: <Videos /> },
      { path: 'room/:roomId', element: <Room /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
