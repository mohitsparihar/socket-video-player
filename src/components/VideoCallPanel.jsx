import { useEffect, useRef, useMemo } from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'meet-nso.diq.geoiq.ai';

// Toolbar buttons for Jitsi when our video sharing is on – exclude 'desktop' (screen sharing)
const TOOLBAR_BUTTONS_NO_SCREEN_SHARE = [
  'microphone', 'camera', 'closedcaptions', 'embedmeeting', 'fullscreen',
  'hangup', 'profile', 'chat', 'livestreaming', 'invite', 'recording',
  'sharedvideo', 'shareaudio', 'settings', 'raisehand', 'videoquality',
  'filmstrip', 'participants-pane', 'tileview',
];

export default function VideoCallPanel({ roomId, displayName, onJitsiJoined, onJitsiModerator, videoSharingEnabled = false, showHeader = true }) {
  const apiRef = useRef(null);
  const localIdRef = useRef(null);
  const jitsiJoinedRef = useRef(false);

  // When video section opens, stop Jitsi screen share if active
  useEffect(() => {
    if (!videoSharingEnabled || !apiRef.current) return;
    const api = apiRef.current;
    api.getContentSharingParticipants?.()
      .then((res) => {
        const sharing = res?.sharingParticipantIds ?? [];
        const localId = localIdRef.current;
        if (localId && sharing.includes(localId)) {
          api.executeCommand('toggleShareScreen');
        }
      })
      .catch(() => { });
  }, [videoSharingEnabled]);
  if (!roomId) return null;

  // Escape room name for Jitsi (alphanumeric, hyphens, underscores)
  const jitsiRoomName = `cobrowse-${roomId}`.replace(/[^a-zA-Z0-9-_]/g, '-');

  const isPreJoin = !displayName;

  const configOverwrite = useMemo(() => ({
    startWithAudioMuted: true,
    startWithVideoMuted: true,
    disableThirdPartyRequests: true,
    enableWelcomePage: false,
    prejoinPageEnabled: true,
    ...(videoSharingEnabled && { toolbarButtons: TOOLBAR_BUTTONS_NO_SCREEN_SHARE }),
  }), [videoSharingEnabled]);

  const interfaceConfigOverwrite = useMemo(() => ({
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
    SHOW_JITSI_WATERMARK: false,
    SHOW_WATERMARK_FOR_GUESTS: false,
  }), []);

  const userInfo = useMemo(() => ({
    displayName: displayName || 'Guest',
  }), [displayName]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: displayName ? 0 : 400, background: '#ffffff', pointerEvents: 'auto' }}>
      {showHeader && !isPreJoin && (
        <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #dee2e6', flexShrink: 0 }}>
          <p style={{ fontSize: '0.875rem', color: '#6c757d', margin: 0 }}>
            Video call with room participants · Room: {jitsiRoomName}
          </p>
        </div>
      )}
      <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: displayName ? 0 : 360, pointerEvents: 'auto' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'auto' }}>
          <JitsiMeeting
            domain={JITSI_DOMAIN}
            roomName={jitsiRoomName}
            configOverwrite={configOverwrite}
            interfaceConfigOverwrite={interfaceConfigOverwrite}
            userInfo={userInfo}
            onApiReady={(externalApi) => {
              apiRef.current = externalApi;
              if (onJitsiJoined) {
                externalApi.addListener('videoConferenceJoined', ({ displayName: name, id: localId }) => {
                  if (jitsiJoinedRef.current) return;
                  jitsiJoinedRef.current = true;
                  localIdRef.current = localId;
                  onJitsiJoined(name || 'Guest');
                });
              }
              if (onJitsiModerator) {
                externalApi.addListener('participantRoleChanged', (event) => {
                  if (event.role === 'moderator') onJitsiModerator();
                });
              }
            }}
            getIFrameRef={(iframeRef) => {
              if (iframeRef) {
                iframeRef.style.width = '100%';
                iframeRef.style.height = '100%';
                iframeRef.style.border = 'none';
                iframeRef.style.display = 'block';
                iframeRef.style.pointerEvents = 'auto';
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
