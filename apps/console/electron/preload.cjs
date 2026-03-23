const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('midsceneConsole', {
  getPlatforms: () => ipcRenderer.invoke('midscene-console:get-platforms'),
  listSessions: () => ipcRenderer.invoke('midscene-console:list-sessions'),
  createSession: (payload) =>
    ipcRenderer.invoke('midscene-console:create-session', payload),
  stopSession: (sessionId) =>
    ipcRenderer.invoke('midscene-console:stop-session', sessionId),
});
