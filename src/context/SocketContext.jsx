import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(undefined);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Connect directly to Socket.io server (avoids Vite proxy EPIPE errors on disconnect)
    const url =
      import.meta.env.DEV
        ? `${window.location.protocol}//${window.location.hostname}:3001`
        : window.location.origin;
    const s = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    setSocket(s);
    return () => s.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  // ctx is undefined when outside provider, null when connecting, or the socket instance
  return ctx;
}
