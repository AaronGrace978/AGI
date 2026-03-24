// ═══════════════════════════════════════════════════════════════
//  AGI PRIME — Conversations & Chat History IPC Handlers
// ═══════════════════════════════════════════════════════════════

const { ipcMain, BrowserWindow, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const ctx = require('../ctx');

// ─── Helper Functions ──────────────────────────────────────────
function loadConversationsIndex() {
  const idx = ctx.loadJSON(ctx.conversationsIndexFile, { version: 1, conversations: [] });
  if (!idx || typeof idx !== 'object') return { version: 1, conversations: [] };
  if (!Array.isArray(idx.conversations)) idx.conversations = [];
  return idx;
}

function saveConversationsIndex(idx) {
  ctx.saveJSON(ctx.conversationsIndexFile, idx);
}

function loadConversationsState() {
  const st = ctx.loadJSON(ctx.conversationsStateFile, { activeConversationId: null });
  if (!st || typeof st !== 'object') return { activeConversationId: null };
  if (!('activeConversationId' in st)) st.activeConversationId = null;
  return st;
}

function saveConversationsState(st) {
  ctx.saveJSON(ctx.conversationsStateFile, st);
}

function conversationPathById(conversationId) {
  return path.join(ctx.conversationsDir, `${conversationId}.json`);
}

function register() {
  // ─── Conversations (NEXUS persistent chat logs) ─────────────────
  ipcMain.handle('conversations:list', async () => {
    try {
      const idx = loadConversationsIndex();
      const st = loadConversationsState();
      const conversations = (idx.conversations || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { success: true, conversations, activeConversationId: st.activeConversationId };
    } catch (e) {
      console.error('[Conversations] list error:', e);
      return { success: false, conversations: [], error: e.message };
    }
  });

  ipcMain.handle('conversations:load', async (_, conversationId) => {
    try {
      if (!conversationId) return { success: false, error: 'Missing conversation id' };
      const filePath = conversationPathById(conversationId);
      if (!fs.existsSync(filePath)) return { success: false, error: 'Conversation not found' };
      const convo = ctx.loadJSON(filePath, null);
      // Mark as active without mutating the conversation metadata.
      const st = loadConversationsState();
      st.activeConversationId = conversationId;
      saveConversationsState(st);
      return { success: true, conversation: convo };
    } catch (e) {
      console.error('[Conversations] load error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('conversations:save', async (_, conversation) => {
    try {
      if (!conversation || typeof conversation !== 'object') return { success: false, error: 'Invalid conversation' };
      const id = conversation.id;
      if (!id) return { success: false, error: 'Missing conversation id' };

      const now = Date.now();
      const createdAt = typeof conversation.createdAt === 'number' ? conversation.createdAt : now;
      const updatedAt = now;
      const title = typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title.trim() : 'New chat';
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

      const toSave = { ...conversation, id, title, createdAt, updatedAt, messages };
      const filePath = conversationPathById(id);
      ctx.saveJSON(filePath, toSave);

      const idx = loadConversationsIndex();
      const meta = {
        id,
        title,
        createdAt,
        updatedAt,
        messageCount: messages.length,
        lastMessagePreview: (messages[messages.length - 1]?.content || '').slice(0, 140),
      };
      idx.conversations = (idx.conversations || []).filter((c) => c.id !== id);
      idx.conversations.unshift(meta);
      idx.conversations = idx.conversations.slice(0, 200);
      saveConversationsIndex(idx);

      const st = loadConversationsState();
      st.activeConversationId = id;
      saveConversationsState(st);

      return { success: true, meta };
    } catch (e) {
      console.error('[Conversations] save error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('conversations:rename', async (_, conversationId, title) => {
    try {
      if (!conversationId) return { success: false, error: 'Missing conversation id' };
      const filePath = conversationPathById(conversationId);
      const convo = ctx.loadJSON(filePath, null);
      if (!convo) return { success: false, error: 'Conversation not found' };
      convo.title = String(title || '').trim() || 'New chat';
      convo.updatedAt = Date.now();
      ctx.saveJSON(filePath, convo);

      const idx = loadConversationsIndex();
      idx.conversations = (idx.conversations || []).map((c) =>
        c.id === conversationId ? { ...c, title: convo.title, updatedAt: convo.updatedAt } : c
      );
      saveConversationsIndex(idx);
      return { success: true, title: convo.title };
    } catch (e) {
      console.error('[Conversations] rename error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('conversations:delete', async (_, conversationId) => {
    try {
      if (!conversationId) return { success: false, error: 'Missing conversation id' };
      const filePath = conversationPathById(conversationId);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      const idx = loadConversationsIndex();
      idx.conversations = (idx.conversations || []).filter((c) => c.id !== conversationId);
      saveConversationsIndex(idx);

      const st = loadConversationsState();
      if (st.activeConversationId === conversationId) {
        st.activeConversationId = null;
        saveConversationsState(st);
      }
      return { success: true };
    } catch (e) {
      console.error('[Conversations] delete error:', e);
      return { success: false, error: e.message };
    }
  });

  // ─── Nexus Chat History Export/Import ─────────────────────────
  ipcMain.handle('chatHistory:export', async (_, messages) => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const defaultPath = path.join(app.getPath('documents'), `agi-prime-chat-${Date.now()}.json`);
      const { filePath, canceled } = await dialog.showSaveDialog(win || null, {
        title: 'Export chat history',
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        app: 'AGI PRIME',
        messages: Array.isArray(messages) ? messages : [],
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { success: true, path: filePath, count: payload.messages.length };
    } catch (e) {
      console.error('[Chat History Export] Error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('chatHistory:import', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const { filePaths, canceled } = await dialog.showOpenDialog(win || null, {
        title: 'Import chat history',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      const raw = fs.readFileSync(filePaths[0], 'utf8');
      const data = JSON.parse(raw);
      const messages = Array.isArray(data.messages) ? data.messages : [];
      return { success: true, messages, path: filePaths[0], count: messages.length };
    } catch (e) {
      console.error('[Chat History Import] Error:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('chatHistory:list', async () => {
    try {
      const documentsDir = app.getPath('documents');
      const subDir = path.join(documentsDir, 'AGI PRIME Chats');
      const dirs = [documentsDir];
      if (fs.existsSync(subDir)) dirs.push(subDir);
      const list = [];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir)
          .filter((f) => f.endsWith('.json') && (f.startsWith('agi-prime-chat-') || f.startsWith('chat-')))
          .map((f) => {
            const filePath = path.join(dir, f);
            const stat = fs.statSync(filePath);
            return { path: filePath, filename: f, modified: stat.mtimeMs, size: stat.size };
          });
        list.push(...files);
      }
      list.sort((a, b) => b.modified - a.modified);
      return { success: true, chats: list };
    } catch (e) {
      console.error('[Chat History List] Error:', e);
      return { success: false, chats: [], error: e.message };
    }
  });

  ipcMain.handle('chatHistory:load', async (_, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);
      const messages = Array.isArray(data.messages) ? data.messages : [];
      return { success: true, messages, count: messages.length };
    } catch (e) {
      console.error('[Chat History Load] Error:', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register };
