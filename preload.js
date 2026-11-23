'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('scripty', {
  info: inv('app:info'),
  getConfig: inv('config:get'),
  setSettings: inv('config:setSettings'),
  setProvider: inv('config:setProvider'),
  setKey: inv('config:setKey'),
  models: inv('ai:models'),
  stream: inv('ai:stream'),
  cancel: inv('ai:cancel'),
  onAI: (cb) => { const h = (e, d) => cb(d); ipcRenderer.on('ai:event', h); return () => ipcRenderer.removeListener('ai:event', h); },
  listProjects: inv('projects:list'),
  loadProject: inv('projects:load'),
  saveProject: inv('projects:save'),
  deleteProject: inv('projects:delete'),
  importFile: inv('file:import'),
  exportFile: inv('file:export'),
  reveal: inv('file:reveal'),
  sfxList: inv('sfx:list'),
  sfxImport: inv('sfx:import'),
  sfxUpdate: inv('sfx:update'),
  sfxRemove: inv('sfx:remove'),
  openExternal: inv('shell:openExternal'),
  setTheme: inv('win:setTheme'),
  openData: inv('data:open'),
});
