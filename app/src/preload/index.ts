import { contextBridge, ipcRenderer } from 'electron';

const api: Api = {
  getPeople: () => ipcRenderer.invoke('getPeople'),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  startSession: (intake) => ipcRenderer.invoke('startSession', intake),
  logEvent: (event) => ipcRenderer.invoke('logEvent', event),
  finalizeSession: () => ipcRenderer.invoke('finalizeSession'),
  copySessionTo: (destDir) => ipcRenderer.invoke('copySessionTo', destDir),
  showExportDialog: () => ipcRenderer.invoke('showExportDialog'),
  quit: () => ipcRenderer.invoke('quit'),
};

contextBridge.exposeInMainWorld('api', api);
