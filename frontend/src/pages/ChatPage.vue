<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import MessageAttachment from '../components/chat/MessageAttachment.vue';
import PendingAttachmentPreview from '../components/chat/PendingAttachmentPreview.vue';
import UiAvatar from '../components/ui/Avatar.vue';
import UiTextarea from '../components/ui/Textarea.vue';
import api from '../api.js';
import { useActiveRoom } from '../composables/useActiveRoom.js';
import { useChatRoom } from '../composables/useChatRoom.js';
import { useChatSidebar } from '../composables/useChatSidebar.js';
import store from '../store.js';

const router = useRouter();
const error = ref('');
const activeRoom = ref(null);
const session = computed(() => store.session);
const showAdminEntry = computed(() => Boolean(session.value?.isAdmin));

const { activeRoomKey, canManageActiveRoom, applyActiveChannel, selectDm, roomLabel } =
  useActiveRoom({ activeRoom, groupSettingsForm: reactive({ name: '', avatarUrl: '', avatarKey: '' }) });

const {
  channels, users, sidebarLoading, conversationItems, formatListTime,
  refreshSidebar, openConversation
} = useChatSidebar({ error, applyActiveChannel, selectDm });

const {
  messages, loading, wsStatus, composerText, pendingAttachment, sending,
  messagesEl, fileInputEl, formatTime, isOwnMessage, bubbleRowClass, bubbleClass,
  loadMessages, connectSocket, disconnectSocket, sendMessage, handleComposerKeydown,
  openFilePicker, uploadAttachment, clearAttachment, loadOlder
} = useChatRoom({
  activeRoom, channels, users, session, error, refreshSidebar, canManageActiveRoom,
  syncGroupSettingsForm: () => {}, groupSettingsForm: { name: '', avatarUrl: '', avatarKey: '' },
  returnToConversationList: () => {}
});

const wsConnected = computed(() => wsStatus.value === 'open');

const showCreateGroup = ref(false);
const createGroupForm = reactive({ name: '', memberIds: [] });
const creatingGroup = ref(false);

function openCreateGroup() { showCreateGroup.value = true; }
function closeCreateGroup() {
  showCreateGroup.value = false;
  createGroupForm.name = '';
  createGroupForm.memberIds = [];
}

function toggleMember(userId) {
  const idx = createGroupForm.memberIds.indexOf(userId);
  if (idx >= 0) createGroupForm.memberIds.splice(idx, 1);
  else createGroupForm.memberIds.push(userId);
}

async function createGroup() {
  if (!createGroupForm.name.trim()) return;
  creatingGroup.value = true;
  error.value = '';
  try {
    const payload = await api.createGroup({
      name: createGroupForm.name.trim(),
      kind: 'private',
      memberUserIds: createGroupForm.memberIds
    });
    await refreshSidebar();
    const newChannel = payload.channel;
    const item = conversationItems.value.find(c => c.id === newChannel.id);
    if (item) await selectConversation(item);
    closeCreateGroup();
  } catch (e) {
    error.value = e.message;
  } finally {
    creatingGroup.value = false;
  }
}

async function selectConversation(item) {
  await openConversation(item);
}

function logout() { store.logout(); router.push('/login'); }
function openAdmin() { router.push('/admin'); }

async function bootstrap() {
  error.value = '';
  try { await refreshSidebar(); }
  catch (e) { error.value = e.message; }
}

watch(activeRoomKey, async (k) => {
  if (!k) return;
  await loadMessages();
  connectSocket();
  for (const delay of [0, 50, 150, 300]) {
    await new Promise(r => setTimeout(r, delay));
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  }
});
onMounted(() => { void bootstrap(); });
onBeforeUnmount(() => { disconnectSocket(); });
</script>

<template>
  <div class="chat-layout">
    <aside class="sidebar">
      <div class="sidebar-inner">
        <div class="sidebar-section">
          <button class="sidebar-user" @click="router.push('/settings')">
            <UiAvatar :src="session?.avatarUrl" :fallback="session?.displayName?.[0] || 'U'" size="sm" />
            <div class="sidebar-label-group">
              <span class="sidebar-label sidebar-user__name">{{ session?.displayName || '用户' }}</span>
            </div>
          </button>
        </div>

        <div class="sidebar-divider"></div>

        <div class="sidebar-section sidebar-list">
          <div v-if="sidebarLoading" class="sidebar-hint">加载中...</div>
          <div v-else-if="!conversationItems.length" class="sidebar-hint">暂无会话</div>
          <button
            v-for="item in conversationItems" :key="item.key"
            class="sidebar-item" :class="{ 'sidebar-item--active': activeRoomKey === item.key }"
            @click="selectConversation(item)"
          >
            <UiAvatar :src="item.avatarUrl" :fallback="item.fallback?.[0] || '?'" size="sm" />
            <div class="sidebar-label-group">
              <div class="sidebar-item__top">
                <strong class="sidebar-label">{{ item.title }}</strong>
                <span class="sidebar-label sidebar-item__time">{{ formatListTime(item.lastMessageAt) }}</span>
              </div>
              <p class="sidebar-label sidebar-item__preview">{{ item.subtitle }}</p>
            </div>
          </button>
        </div>

        <div class="sidebar-divider"></div>

        <div class="sidebar-section sidebar-actions">
          <button class="sidebar-action" @click="openCreateGroup" title="创建群聊">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
            <span class="sidebar-label">创建群聊</span>
          </button>
          <button v-if="showAdminEntry" class="sidebar-action" @click="openAdmin" title="后台">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            <span class="sidebar-label">后台</span>
          </button>
          <button class="sidebar-action sidebar-action--danger" @click="logout" title="退出">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span class="sidebar-label">退出</span>
          </button>
        </div>
      </div>
    </aside>

    <main class="chat-main">
      <template v-if="activeRoom">
        <header class="chat-header">
          <h2>{{ roomLabel(activeRoom) }}</h2>
          <div class="chat-header__status" :class="wsConnected ? 'online' : 'offline'"></div>
        </header>

        <section ref="messagesEl" class="chat-messages">
          <button v-if="messages.length" type="button" class="load-more-btn" @click="loadOlder">加载更早</button>
          <div v-if="loading" class="messages-hint">加载中...</div>
          <div v-else-if="!messages.length" class="messages-hint">暂无消息</div>

          <article
            v-for="msg in messages" :key="msg.id"
            class="message-row" :class="{ 'message-row--own': isOwnMessage(msg) }"
          >
            <UiAvatar v-if="!isOwnMessage(msg)" :src="msg.sender.avatarUrl" :fallback="msg.sender.displayName?.[0] || '?'" size="sm" class="message-avatar" />
            <div class="message-bubble" :class="bubbleClass(msg, 0)">
              <div class="message-meta">
                <strong>{{ isOwnMessage(msg) ? '我' : msg.sender.displayName }}</strong>
                <span>{{ formatTime(msg.createdAt) }}</span>
              </div>
              <p v-if="msg.content">{{ msg.content }}</p>
              <MessageAttachment v-if="msg.attachment" :attachment="msg.attachment" />
            </div>
          </article>
        </section>

        <footer class="chat-composer">
          <div v-if="pendingAttachment" class="composer-attachment">
            <PendingAttachmentPreview :attachment="pendingAttachment" @clear="clearAttachment" />
          </div>
          <div v-if="error" class="composer-error">{{ error }}</div>
          <div class="composer-row">
            <input ref="fileInputEl" type="file" class="composer-file-input" @change="uploadAttachment" />
            <button type="button" class="composer-btn" :disabled="!activeRoom" @click="openFilePicker">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <UiTextarea
              v-model="composerText" class="composer-input" auto-grow :max-height="120" rows="1"
              :disabled="!activeRoom" placeholder="输入消息..." @keydown="handleComposerKeydown"
            />
            <button type="button" class="composer-send" :disabled="sending || !activeRoom" @click="sendMessage">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="12" x2="20" y2="12"/>
                <polyline points="14 6 20 12 14 18"/>
              </svg>
            </button>
          </div>
        </footer>
      </template>

      <div v-else class="chat-empty">
        <div class="empty-content">
          <div class="empty-brand">
            <span class="empty-title">EdgeChat</span>
          </div>
        </div>
      </div>
    </main>

    <Transition name="modal-fade">
      <div v-if="showCreateGroup" class="modal-overlay" @click.self="closeCreateGroup">
        <div class="modal-card">
          <h3>创建群聊</h3>
          <input
            v-model="createGroupForm.name"
            type="text"
            class="modal-input"
            placeholder="群聊名称"
          />
          <div class="modal-members">
            <label>选择成员</label>
            <div class="member-list">
              <button
                v-for="user in users" :key="user.id" type="button"
                class="member-chip"
                :class="{ 'member-chip--selected': createGroupForm.memberIds.includes(user.id) }"
                @click="toggleMember(user.id)"
              >
                <UiAvatar :src="user.avatarUrl" :fallback="user.displayName?.[0] || '?'" size="sm" />
                <span>{{ user.displayName }}</span>
              </button>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="closeCreateGroup">取消</button>
            <button
              type="button"
              class="btn-primary"
              :disabled="!createGroupForm.name.trim() || creatingGroup"
              @click="createGroup"
            >
              {{ creatingGroup ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-layout {
  display: flex;
  height: 100vh;
  background: #f5f7fa;
}

.sidebar {
  flex-shrink: 0;
  width: 68px;
  height: 100vh;
  padding: 10px 6px;
  transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  z-index: 10;
  overflow: hidden;
}

.sidebar:hover {
  width: 300px;
}

.sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  border: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
  padding: 14px 10px;
  overflow: hidden;
}

.sidebar-section {
  flex-shrink: 0;
}

.sidebar-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin: 0 -10px;
  padding: 0 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
}

.sidebar-list::-webkit-scrollbar { width: 3px; }
.sidebar-list::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 2px; }

.sidebar-divider {
  flex-shrink: 0;
  height: 1px;
  margin: 8px 4px;
  background: rgba(0, 0, 0, 0.06);
}

.sidebar-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 8px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.3);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 150ms, padding 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar:not(:hover) .sidebar-user {
  padding: 2px 0;
}

.sidebar-user:hover {
  background: rgba(0, 0, 0, 0.04);
}

.sidebar:hover .sidebar-user {
  padding: 6px;
}

.sidebar-user svg,
.sidebar-item svg,
.sidebar-action svg {
  flex-shrink: 0;
}

.sidebar-user :deep(.ui-avatar),
.sidebar-item :deep(.ui-avatar) {
  flex-shrink: 0;
}

.sidebar-user__name {
  font-size: 14px;
  font-weight: 600;
  color: #1a2332;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 150ms, padding 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar:not(:hover) .sidebar-item {
  padding: 2px 0;
}

.sidebar-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.sidebar:hover .sidebar-item {
  padding: 8px;
}

.sidebar-item--active {
  background: rgba(59, 130, 246, 0.08);
}

.sidebar-item__top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.sidebar-item__top strong {
  font-size: 14px;
  font-weight: 500;
  color: #1a2332;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-item__time {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.3);
  flex-shrink: 0;
}

.sidebar-item__preview {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar:not(:hover) .sidebar-actions {
  align-items: center;
  gap: 6px;
}

.sidebar-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 10px 0;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: rgba(0, 0, 0, 0.4);
  transition: background 150ms, color 150ms, padding 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sidebar:not(:hover) .sidebar-action {
  width: 36px;
  height: 36px;
  padding: 0;
  gap: 0;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.025);
}

.sidebar-action:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #1a2332;
}

.sidebar:not(:hover) .sidebar-action:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sidebar:hover .sidebar-action {
  padding: 8px;
  justify-content: flex-start;
}

.sidebar-action--danger:hover {
  background: rgba(254, 242, 242, 0.6);
  color: #dc2626;
}

.sidebar-label-group {
  flex: 1;
  min-width: 0;
}

.sidebar-label {
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1) 120ms;
}

.sidebar:not(:hover) .sidebar-label {
  width: 0;
  flex: none;
  overflow: hidden;
  padding: 0;
  margin: 0;
}

.sidebar:hover .sidebar-label {
  opacity: 1;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar:not(:hover) ~ .chat-main .chat-messages {
  padding-left: 108px;
}

.sidebar:not(:hover) ~ .chat-main .chat-composer {
  margin-left: 108px;
  margin-right: 108px;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 24px 12px;
  background: transparent;
  border-bottom: none;
}

.chat-header h2 {
  margin: 0;
  padding: 6px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 999px;
}

.chat-header__status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
}

.chat-header__status.online {
  background: #10b981;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 48px;
}

.chat-messages::-webkit-scrollbar { width: 6px; }
.chat-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }

.load-more-btn {
  display: block;
  margin: 0 auto 16px;
  padding: 6px 16px;
  border: 1px solid #e8ecf0;
  border-radius: 16px;
  background: #fff;
  color: #6b7c93;
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
}

.load-more-btn:hover {
  background: #f5f7fa;
  border-color: #d1d5db;
}

.messages-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  color: #9ca3af;
  font-size: 14px;
}

.message-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  max-width: 840px;
  align-items: flex-start;
}

.message-row--own {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-bubble {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e8ecf0;
}

.message-row--own .message-bubble {
  background: #e8f0fe;
  border-color: #d1e0fc;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.message-meta strong {
  font-size: 12px;
  font-weight: 500;
  color: #1a2332;
}

.message-meta span {
  font-size: 11px;
  color: #9ca3af;
}

.message-bubble p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #1a2332;
  white-space: pre-wrap;
  word-break: break-word;
}

@keyframes composer-pulse {
  0%, 100% { border-color: rgba(0, 0, 0, 0.08); box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
  50% { border-color: rgba(0, 0, 0, 0.14); box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.03); }
}

.chat-composer {
  margin-top: auto;
  margin-bottom: 64px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: none;
  position: relative;
  z-index: 2;
  margin-left: 24px;
  margin-right: 24px;
  transition: border-color 300ms, box-shadow 300ms;
}

.chat-composer:focus-within {
  animation: composer-pulse 2.4s ease-in-out infinite;
}

.composer-attachment {
  margin-bottom: 10px;
}

.composer-error {
  margin-bottom: 8px;
  font-size: 12px;
  color: #dc2626;
  text-align: center;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.composer-file-input {
  display: none;
}

.composer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #8b9db5;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms, color 150ms;
}

.composer-btn:hover:not(:disabled) {
  background: #f0f2f5;
  color: #1a2332;
}

.composer-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.composer-input {
  flex: 1;
}

:deep(.composer-input.ui-textarea) {
  border: none;
  background: transparent;
  box-shadow: none;
  min-height: 36px;
  padding: 8px 4px;
  color: #1a2332;
  font-size: 14px;
  resize: none;
}

:deep(.composer-input.ui-textarea:focus) {
  border-color: transparent;
  box-shadow: none;
}

:deep(.composer-input.ui-textarea::placeholder) {
  color: #adbcc8;
}

.composer-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms;
}

.composer-send:hover:not(:disabled) {
  background: #eff3ff;
}

.composer-send:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
  user-select: none;
}

.empty-title {
  font-size: 28px;
  font-weight: 400;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-style: italic;
  letter-spacing: 0.02em;
  color: #1a2332;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.modal-card {
  width: 100%;
  max-width: 420px;
  padding: 24px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-card h3 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
  color: #1a2332;
}

.modal-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  background: #f9fafb;
  color: #1a2332;
  font-size: 14px;
  outline: none;
  transition: border-color 150ms, box-shadow 150ms;
  margin-bottom: 16px;
}

.modal-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  background: #fff;
}

.modal-input::placeholder {
  color: #9ca3af;
}

.modal-members {
  margin-bottom: 20px;
}

.modal-members label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: #6b7c93;
}

.member-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 160px;
  overflow-y: auto;
  padding: 4px;
}

.member-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid #e8ecf0;
  border-radius: 20px;
  background: #fff;
  color: #1a2332;
  font-size: 13px;
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
}

.member-chip:hover {
  background: #f5f7fa;
}

.member-chip--selected {
  background: #e8f0fe;
  border-color: #3b82f6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-secondary {
  padding: 10px 20px;
  border: 1px solid #e8ecf0;
  border-radius: 10px;
  background: #fff;
  color: #6b7c93;
  font-size: 14px;
  cursor: pointer;
  transition: background 150ms, color 150ms;
}

.btn-secondary:hover {
  background: #f5f7fa;
  color: #1a2332;
}

.btn-primary {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-fade-enter-active {
  transition: opacity 200ms;
}

.modal-fade-leave-active {
  transition: opacity 150ms;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .sidebar {
    width: 0;
    padding: 8px 0;
    overflow: hidden;
  }

  .sidebar:hover {
    width: 280px;
    padding: 8px 4px;
  }

  .sidebar-inner {
    border-radius: 12px;
    padding: 12px 8px;
  }
}
</style>
