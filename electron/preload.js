const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    saveFiles: (files) => ipcRenderer.invoke('download:saveFiles', files)
});
