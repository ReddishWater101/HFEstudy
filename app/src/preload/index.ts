import { contextBridge, ipcRenderer } from 'electron';

const api: Api = {
  getConfig: () => ipcRenderer.invoke('getConfig'),
  getPeopleWithUuids: () => ipcRenderer.invoke('getPeopleWithUuids'),
  getRegistry: () => ipcRenderer.invoke('getRegistry'),
  readStudyFile: (filePath) => ipcRenderer.invoke('readStudyFile', filePath),
  writeStudyFile: (filePath, config) =>
    ipcRenderer.invoke('writeStudyFile', filePath, config),
  showStudyFileOpenDialog: () => ipcRenderer.invoke('showStudyFileOpenDialog'),
  showStudyFileSaveDialog: (config) =>
    ipcRenderer.invoke('showStudyFileSaveDialog', config),
  startSession: (intake) => ipcRenderer.invoke('startSession', intake),
  logEvent: (event) => ipcRenderer.invoke('logEvent', event),
  finalizeSession: () => ipcRenderer.invoke('finalizeSession'),
  copySessionTo: (destDir) => ipcRenderer.invoke('copySessionTo', destDir),
  showExportDialog: () => ipcRenderer.invoke('showExportDialog'),
  downloadSessionZip: () => ipcRenderer.invoke('downloadSessionZip'),
  quit: () => ipcRenderer.invoke('quit'),
};

contextBridge.exposeInMainWorld('api', api);
