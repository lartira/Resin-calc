// Fake electronAPI that serves demo data, used only by scripts/screenshots.js
const { contextBridge } = require('electron');
const path = require('path');
const fs = require('fs');

const { data, session } = JSON.parse(fs.readFileSync(path.join(__dirname, '.demo-data.json'), 'utf-8'));
const ok = async () => ({ success: true });

// Lets the screenshot script show the update popup with a made-up version.
// The status goes through a DOM attribute, since event details don't cross
// from the page into this isolated preload world.
let updateListener = null;
window.addEventListener('demo-update', () => {
    updateListener?.(JSON.parse(document.body.dataset.demoUpdate));
});

contextBridge.exposeInMainWorld('electronAPI', {
    getData: async () => data,
    getSession: async () => session.calculatorInputs,
    saveData: ok,
    saveSession: ok,
    saveLocalBuffer: ok,
    syncData: ok,
    savePdf: ok,
    exportBackup: ok,
    importBackup: ok,
    changeDataPath: ok,
    getDataPath: async () => 'C:\\Users\\demo\\Documents',
    onCloseIntent: () => () => {},
    confirmClose: () => {},
    checkForUpdates: ok,
    downloadUpdate: ok,
    installUpdate: ok,
    onUpdateStatus: (callback) => {
        updateListener = callback;
        return () => { updateListener = null; };
    }
});
