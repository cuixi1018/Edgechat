import api from '../api.js';
import { connectInboxSocket } from '../ws.js';

export function useUnreadInbox({
  activeRoom,
  applyConversationActivity,
  markConversationRead
}) {
  let inboxSocket = null;

  function closeInboxSocket() {
    if (!inboxSocket) {
      return;
    }

    try {
      inboxSocket.close();
    } catch {
      // WebSocket 已经断开时忽略关闭错误，避免卸载页面时打断正常清理。
    } finally {
      inboxSocket = null;
    }
  }

  function isActiveRoom(room) {
    return (
      activeRoom.value &&
      activeRoom.value.kind === room.kind &&
      Number(activeRoom.value.id) === Number(room.id)
    );
  }

  function connectUnreadInbox() {
    closeInboxSocket();
    inboxSocket = connectInboxSocket({
      onMessage(payload) {
        if (payload.type !== 'room_message' || !payload.room) {
          return;
        }

		if (isActiveRoom(payload.room)) {
			markConversationRead(payload.room.kind, payload.room.id);
			void api
				.markRoomRead(payload.room.kind, payload.room.id, payload.messageId)
				.catch(() => {});
			return;
		}

        applyConversationActivity({
          kind: payload.room.kind,
          roomId: payload.room.id,
          lastMessageAt: payload.createdAt,
          unreadCount: payload.unreadCount
        });
      },
      onStatus(event) {
        if (event.status === 'closed' && inboxSocket === event.socket) {
          inboxSocket = null;
        }
      }
    });
  }

  return {
    connectUnreadInbox,
    disconnectUnreadInbox: closeInboxSocket
  };
}
