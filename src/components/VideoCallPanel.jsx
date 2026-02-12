import { JitsiMeeting } from '@jitsi/react-sdk';

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'meet-nso.diq.geoiq.ai';

export default function VideoCallPanel({ roomId, displayName, onJitsiJoined }) {
  if (!roomId) return null;

  // Escape room name for Jitsi (alphanumeric, hyphens, underscores)
  const jitsiRoomName = `cobrowse-${roomId}`.replace(/[^a-zA-Z0-9-_]/g, '-');

  return (
    <div className="flex flex-col h-full min-h-0 bg-cinema-black">
      <div className="px-3 py-2 border-b border-cinema-border shrink-0">
        <p className="text-sm text-cinema-muted">
          {displayName
            ? `Video call with room participants · Room: ${jitsiRoomName}`
            : 'Join the video call to participate in this room'}
        </p>
      </div>
      <div className="flex-1 min-h-0 relative">
        <JitsiMeeting
          domain={JITSI_DOMAIN}
          roomName={jitsiRoomName}
          configOverwrite={{
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableThirdPartyRequests: true,
            enableWelcomePage: false,
            prejoinPageEnabled: true,
          }}
          interfaceConfigOverwrite={{
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          }}
          userInfo={{
            displayName: displayName || 'Guest',
          }}
          onApiReady={(externalApi) => {
            if (onJitsiJoined) {
              externalApi.addListener('videoConferenceJoined', ({ displayName: name }) => {
                onJitsiJoined(name || 'Guest');
              });
            }
          }}
          getIFrameRef={(iframeRef) => {
            if (iframeRef) {
              iframeRef.style.height = '100%';
              iframeRef.style.width = '100%';
              iframeRef.style.minHeight = '300px';
            }
          }}
        />
      </div>
    </div>
  );
}
