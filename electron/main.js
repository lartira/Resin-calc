const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');

// Helper to safely parse JSON that might have BOM
function parseJSONSafe(jsonString) {
    try {
        // Strip BOM if present
        const cleanString = jsonString.charCodeAt(0) === 0xFEFF
            ? jsonString.slice(1)
            : jsonString;
        return JSON.parse(cleanString);
    } catch (e) {
        throw e;
    }
}

// Define path to data file
// Using app.getPath('userData') ensures it's in a standard OS location
// On Windows: %APPDATA%/epoxy-calculator/epoxy_data.json
const DATA_FILE_NAME = 'epoxy_data.json';
const CONFIG_FILE_NAME = 'config.json';
const CONFIG_PATH = path.join(app.getPath('userData'), CONFIG_FILE_NAME);

// Function to get current data path
// Function to get current data path
function getDataPath() {
    const backupConfigPath = path.join(app.getPath('documents'), 'epoxy_config_backup.json');
    let config = null;

    // 1. Try Main Config (AppData)
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = parseJSONSafe(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch (e) {
        console.warn("Main config corrupt/unreadable:", e);
        // Fallthrough to backup check
    }

    if (config && config.dataPath) {
        // Success! Main config works.
        // Ensure backup exists for future safety
        try {
            if (!fs.existsSync(backupConfigPath)) {
                fs.writeFileSync(backupConfigPath, JSON.stringify(config, null, 2));
            }
        } catch (e) { }

        return path.join(config.dataPath, DATA_FILE_NAME);
    }

    // 2. Main Config Failed/Missing? Try Backup (Documents)
    try {
        if (fs.existsSync(backupConfigPath)) {
            const backupConfig = parseJSONSafe(fs.readFileSync(backupConfigPath, 'utf-8'));
            if (backupConfig.dataPath) {
                // RESTORE Main Config
                console.log("Restoring config from backup...");
                try {
                    if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
                        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
                    }
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(backupConfig, null, 2));
                } catch (restoreErr) {
                    console.error("Failed to restore config file:", restoreErr);
                }

                return path.join(backupConfig.dataPath, DATA_FILE_NAME);
            }
        }
    } catch (e) {
        console.error("Backup config restore failed", e);
    }

    // 3. Default fallback only if NO config exists anywhere
    return path.join(app.getPath('documents'), DATA_FILE_NAME);
}

let DATA_PATH = getDataPath();

// Default Data Structure (Chapter 4)
const DEFAULT_DATA = {
    settings: {
        price1to1: 125.0,
        price2to1: 125.0,
        hourlyRate: 150.0,
        buffer: 15.0,
        moldWear: 10.0,
        vacuumCost: 5.0,
        consumables: 5.0
    },
    entries: [],
    colors: [],
    materials: [],
    customers: [],
    materialCategories: [],
    colorCategories: []
};

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Security best practice
            contextIsolation: true, // Security best practice
            sandbox: false // Needed for some fs operations if not strictly isolated? false is okay for local tool
        },
        icon: path.join(__dirname, '../public/icon.png')
    });

    // Check if we are in dev mode (localhost) or prod
    // In this setup, we assume dev if env variable is set or we can try to connect to localhost
    // For simplicity in the generated package.json script 'electron .', we might need to wait for vite.
    // The 'dev:electron' script waits on port 5173.

    // We can check if the dev server is running by trying to load the URL?
    // Or just use command line args.

    // Simple meaningful check:
    // If we are running via 'electron .' AND 'npm run dev' is active, load localhost.
    // If packaged, load index.html.

    // Check environment
    const isDev = !app.isPackaged;

    if (isDev) {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Close Confirmation Logic
    win.on('close', (e) => {
        if (isInstallingUpdate) return; // Data was saved before quitAndInstall
        e.preventDefault();
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Gem og Luk', 'Luk uden at gemme', 'Annuller'],
            title: 'Luk Program',
            message: 'Vil du gemme alle ændringer? (Auto-gemte ændringer bevares)',
            defaultId: 0,
            cancelId: 2
        });
        if (choice === 0) {
            // Ask renderer to save data before closing
            win.webContents.send('app-close-intent');
        } else if (choice === 1) {
            // Close immediately without saving pending buffer
            win.destroy();
        }
    });
}

// Auto Updater
// All update UI lives in the renderer (UpdateNotifier.jsx). Main only forwards
// electron-updater events as 'update-status' messages and acts on IPC requests.
autoUpdater.autoDownload = false; // We ask user first
// UPDATE_DEV_TEST=1 lets `npm run dev` check against dev-app-update.yml (e.g. a local test feed)
if (process.env.UPDATE_DEV_TEST) autoUpdater.forceDevUpdateConfig = true;

const UPDATE_CHECK_DELAY_MS = 5 * 1000; // First check shortly after startup
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // Then every 4 hours

let manualCheckTriggered = false;
let isInstallingUpdate = false; // Lets the close handler step aside for quitAndInstall
let installAfterSave = false; // Set when renderer should save before we install

function sendUpdateStatus(status) {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('update-status', { ...status, manual: manualCheckTriggered });
    }
}

// Release notes from GitHub can be HTML or a list of { version, note } objects
function normalizeReleaseNotes(notes) {
    if (!notes) return '';
    if (Array.isArray(notes)) return notes.map(n => n.note || '').join('\n\n');
    return String(notes);
}

autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus({ state: 'checking' });
});

autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({
        state: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    });
    manualCheckTriggered = false;
});

autoUpdater.on('update-not-available', () => {
    sendUpdateStatus({ state: 'not-available' });
    manualCheckTriggered = false;
});

autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
        state: 'downloading',
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
    });
});

autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ state: 'downloaded', version: info.version });
});

autoUpdater.on('error', (error) => {
    const errStr = error == null ? 'unknown' : (error.message || error).toString();
    console.warn('Auto updater error:', errStr);
    // Background checks fail silently (offline, private repo, missing latest.yml).
    // The renderer only shows errors for manual checks or failed downloads.
    sendUpdateStatus({ state: 'error', message: errStr });
    manualCheckTriggered = false;
});

function checkForUpdates(manual = false) {
    if (!app.isPackaged && !process.env.UPDATE_DEV_TEST) return; // No update feed in dev
    manualCheckTriggered = manual;
    autoUpdater.checkForUpdates().catch(() => { /* reported via 'error' event */ });
}

function startUpdateSchedule() {
    setTimeout(() => checkForUpdates(false), UPDATE_CHECK_DELAY_MS);
    setInterval(() => checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS);
}

ipcMain.handle('update-check', () => checkForUpdates(true));

ipcMain.handle('update-download', () => {
    autoUpdater.downloadUpdate().catch(() => { /* reported via 'error' event */ });
});

// Save through the normal close flow first, then install (see 'app-close-confirmed')
ipcMain.handle('update-install', (event) => {
    installAfterSave = true;
    event.sender.send('app-close-intent');
});

function installUpdateNow() {
    isInstallingUpdate = true;
    autoUpdater.quitAndInstall();
}

function createAppMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Check for Updates',
                    click: () => checkForUpdates(true)
                },
                {
                    label: 'About',
                    click: async () => {
                        const { response } = await dialog.showMessageBox({
                            type: 'info',
                            title: 'About Epoxy Calculator',
                            message: `Epoxy Calculator v${app.getVersion()}`,
                            detail: 'Created by FeatterGruppen.\n\nOpen Source Project.',
                            buttons: ['Visit Website', 'OK']
                        });
                        if (response === 0) {
                            shell.openExternal('https://github.com/lartira/Resin-calc');
                        }
                    }
                }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}


// IPC Handlers
ipcMain.handle('get-data', async (event) => {
    // 0. Configuration Integrity Check (Fixes "Update Wipes Settings")
    // If config.json is missing, we are likely on Default.
    // If we are on Default but user expects Custom, we must ask.
    if (!fs.existsSync(CONFIG_PATH)) {
        // Double check: if backup config exists, wait, we should have restored it in getDataPath?
        // If we are here, BOTH are missing.
        // Show Dialog.
        const win = BrowserWindow.getFocusedWindow();
        if (win) { // Ensure window exists
            const choice = dialog.showMessageBoxSync(win, {
                type: 'warning',
                title: 'Configuration Missing',
                message: 'Your settings could not be loaded (New install or update reset).',
                detail: `The application is using the default folder:\n${DATA_PATH}\n\nIs this correct?`,
                buttons: ['Use Default Folder', 'Connect to Existing Database']
            });

            if (choice === 1) {
                // User wants to connect to existing DB
                const { canceled, filePaths } = await dialog.showOpenDialog(win, {
                    title: 'Select Database Folder',
                    properties: ['openDirectory']
                });

                if (!canceled && filePaths.length > 0) {
                    const newDir = filePaths[0];
                    const newPath = path.join(newDir, DATA_FILE_NAME);

                    // Save Config & Backup
                    const configData = JSON.stringify({ dataPath: newDir }, null, 2);
                    fs.writeFileSync(CONFIG_PATH, configData);
                    try {
                        fs.writeFileSync(path.join(app.getPath('documents'), 'epoxy_config_backup.json'), configData);
                    } catch (e) { }

                    DATA_PATH = newPath;
                    // Proceed to load from NEW path
                }
            }
        }
    }

    // 0. Network Drive Warm-up Logic
    // If path is not C:, we wait a bit for it to mount (common issue with mapped drives on login)
    try {
        if (!DATA_PATH.toLowerCase().startsWith('c:') && !fs.existsSync(DATA_PATH)) {
            console.log("Network/External drive detected. Waiting for mount...");
            for (let i = 0; i < 20; i++) { // Wait up to 10 seconds (20 * 500ms)
                if (fs.existsSync(DATA_PATH)) {
                    console.log("Drive mounted!");
                    break;
                }
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (e) { }

    // 1. Check for Emergency Conflict Files (Stale Data Protection)
    try {
        const dir = path.dirname(DATA_PATH);
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const basename = path.basename(DATA_FILE_NAME, '.json');
            const conflictFiles = files.filter(f => f.startsWith(basename + '_conflict_') && f.endsWith('.json'));

            if (conflictFiles.length > 0) {
                conflictFiles.sort().reverse(); // Newest first
                const rescueFile = path.join(dir, conflictFiles[0]);

                const choice = dialog.showMessageBoxSync({
                    type: 'question',
                    title: 'Unsaved Changes Found',
                    message: `A 'Rescue File' from a previous failed save was found.\n\nFile: ${conflictFiles[0]}\n\nThis usually contains data that couldn't be requested to the main database. Do you want to load these changes?`,
                    buttons: ['Yes, Load Rescue Data', 'No, Load Main Database']
                });

                if (choice === 0) {
                    try {
                        // Restore rescue file OVER main file
                        fs.copyFileSync(rescueFile, DATA_PATH);
                        // Rename conflict file to prevent loop
                        fs.renameSync(rescueFile, rescueFile + '.restored');
                    } catch (err) {
                        dialog.showErrorBox("Restore Failed", err.message);
                    }
                }
            }
        }
    } catch (e) { console.error("Stale check failed", e); }

    let retries = 0;
    while (true) {
        try {
            // Attempt read
            const data = await safeReadFile(DATA_PATH);
            return parseJSONSafe(data);

        } catch (error) {
            const isDefaultPath = DATA_PATH.includes(path.join(app.getPath('documents'), DATA_FILE_NAME));

            // Case 1: File Not Found (ENOENT)
            if (error.code === 'ENOENT') {
                if (isDefaultPath) {
                    // Safe to create default on local documents
                    try {
                        fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
                        return DEFAULT_DATA;
                    } catch (writeErr) {
                        // Fallthrough to error dialog
                        error.message = "Could not create default database: " + writeErr.message;
                    }
                } else {
                    // Check for Emergency Conflict Files (Rescue Plan)
                    // Helper to reuse for ENOENT and Corruption
                    const checkAndRestoreRescue = () => {
                        try {
                            const dir = path.dirname(DATA_PATH);
                            const files = fs.readdirSync(dir);
                            const basename = path.basename(DATA_FILE_NAME, '.json');
                            const conflictFiles = files.filter(f => f.startsWith(basename + '_conflict_') && f.endsWith('.json'));

                            if (conflictFiles.length > 0) {
                                conflictFiles.sort().reverse();
                                const rescueFile = path.join(dir, conflictFiles[0]);
                                const rescueChoice = dialog.showMessageBoxSync({
                                    type: 'info',
                                    title: 'Rescue File Found',
                                    message: `A saved rescue file was found:\n${conflictFiles[0]}\n\nDo you want to restore from this file?`,
                                    buttons: ['Yes, Restore & Retry', 'No, Ignore']
                                });
                                if (rescueChoice === 0) {
                                    fs.copyFileSync(rescueFile, DATA_PATH);
                                    return true;
                                }
                            }
                        } catch (e) { /* ignore */ }
                        return false;
                    };

                    if (checkAndRestoreRescue()) continue;

                    // Custom/Network Path: DO NOT auto-create. Ask User.
                    const choice = dialog.showMessageBoxSync({
                        type: 'warning',
                        title: 'Database Missing',
                        message: `The database file was not found at:\n${DATA_PATH}\n\nDo you want to create a new empty database here?`,
                        buttons: ['Create New Database', 'Retry Connection', 'Quit Program'],
                        defaultId: 1,
                        cancelId: 2
                    });

                    if (choice === 0) {
                        // Create New
                        try {
                            fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
                            return DEFAULT_DATA;
                        } catch (wErr) {
                            dialog.showErrorBox("Creation Failed", wErr.message);
                            continue;
                        }
                    } else if (choice === 1) {
                        continue; // Retry loop
                    } else {
                        app.quit();
                        return DEFAULT_DATA; // Exit
                    }
                }
            }

            // Case 2: Read/Parse Error (Corruption, Locked, etc)
            // FIRST: Check if there is a rescue file we can use!
            const checkAndRestoreRescue = () => {
                try {
                    const dir = path.dirname(DATA_PATH);
                    const files = fs.readdirSync(dir);
                    const basename = path.basename(DATA_FILE_NAME, '.json');
                    const conflictFiles = files.filter(f => f.startsWith(basename + '_conflict_') && f.endsWith('.json'));

                    if (conflictFiles.length > 0) {
                        conflictFiles.sort().reverse();
                        const rescueFile = path.join(dir, conflictFiles[0]);
                        const rescueChoice = dialog.showMessageBoxSync({
                            type: 'info',
                            title: 'Rescue File Found',
                            message: `The database appears corrupt/unreadable, BUT a saved rescue file was found:\n${conflictFiles[0]}\n\nDo you want to restore from this file instead of losing data?`,
                            buttons: ['Yes, Restore & Retry', 'No, Ignore']
                        });
                        if (rescueChoice === 0) {
                            fs.copyFileSync(rescueFile, DATA_PATH);
                            return true; // Restored
                        }
                    }
                } catch (e) { /* ignore */ }
                return false;
            };

            if (checkAndRestoreRescue()) continue;

            const response = dialog.showMessageBoxSync({
                type: 'error',
                title: 'Data Load Error',
                message: `Failed to load database from:\n${DATA_PATH}\n\nError: ${error.message}`,
                buttons: ['Retry', 'Start with Empty Data (Dangerous)', 'Quit'],
                defaultId: 0,
                cancelId: 2
            });

            if (response === 0) continue; // Retry
            if (response === 1) return DEFAULT_DATA; // DANGEROUS FALLBACK
            app.quit();
            return DEFAULT_DATA;
        }
    }
});

// Helper for Robust Reads (Retries on EBUSY/Null)
async function safeReadFile(filePath) {
    let lastError;
    for (let i = 0; i < 5; i++) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            if (content.trim() === '') throw new Error("File is empty"); // Treat empty as read fail
            return content;
        } catch (err) {
            lastError = err;
            if (err.code === 'ENOENT') throw err; // Not found is not a retryable IO error

            // Wait: 50, 100, 200, 400, 800
            await new Promise(r => setTimeout(r, 50 * Math.pow(2, i)));
        }
    }
    throw lastError;
}

// Smart Auto-Save Handlers
const TEMP_FILE_NAME = 'epoxy_temp_buffer.json';
const TEMP_PATH = path.join(app.getPath('userData'), TEMP_FILE_NAME);

// Helper for Atomic Writes (prevents corruption)
// Helper for Atomic Writes (prevents corruption)
// Mutex to serialise writes and prevent race conditions on .tmp file
let writeLock = Promise.resolve();

async function safeWriteFile(filePath, data) {
    // Wait for any previous write to finish
    // We wrap the actual logic in a chained promise
    const currentWrite = writeLock.then(async () => {
        const tempPath = filePath + '.tmp';
        const maxRetries = 5; // Reduced to 5 (approx 10-15s max) to improve responsiveness

        for (let i = 0; i < maxRetries; i++) {
            let handle;
            try {
                // 1. Write to temp file (Inside loop to ensure it exists for retry)
                handle = await fs.promises.open(tempPath, 'w');
                await handle.writeFile(data, 'utf-8');
                await handle.sync(); // Flush
                await handle.close();
                handle = null;

                // 2. Cleanup Target (Helpful for Windows replacement)
                // Only try explicit delete on later retries to avoid race conditions on first try
                if (i > 2 && fs.existsSync(filePath)) {
                    try { await fs.promises.unlink(filePath); } catch (e) { /* ignore EBUSY/EPERM here */ }
                }

                // 3. Rename with Copy Fallback
                try {
                    await fs.promises.rename(tempPath, filePath);
                } catch (renameErr) {
                    // If Rename fails (EPERM/EBUSY/EXDEV), try COPY
                    // Copy is often more robust on network shares as it's just a data write, not a metadata move
                    if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY' || renameErr.code === 'EXDEV' || renameErr.code === 'EACCES') {
                        if (i > 0) console.warn(`Rename failed (${renameErr.code}), attempting Copy Fallback...`);
                        await fs.promises.copyFile(tempPath, filePath);
                        // If copy succeeds, we try to remove temp (best effort)
                        try { await fs.promises.unlink(tempPath); } catch (e) { }
                    } else {
                        throw renameErr; // Rethrow other errors
                    }
                }

                // 4. Verify Integrity (Read back AND Compare content)
                const verifyContent = await fs.promises.readFile(filePath, 'utf-8');

                // Critical Check: Does the file on disk actally match what we wrote?
                if (verifyContent.trim() !== data.trim()) {
                    throw new Error("Stale Write: File on disk does not match written data.");
                }

                JSON.parse(verifyContent); // Double check validity
                return; // Success

            } catch (err) {
                // Ensure handle is closed if error occurred during write
                if (handle) { try { await handle.close(); } catch (e) { } }

                if (i > 0) console.warn(`Write attempt ${i + 1} failed:`, err.message);

                // FINAL ATTEMPT FAILED: Try Emergency Save
                if (i === maxRetries - 1) {
                    try {
                        const emergencyPath = filePath.replace('.json', '') + `_conflict_${Date.now()}.json`;
                        console.warn("Attempting Emergency Save to:", emergencyPath);
                        await fs.promises.writeFile(emergencyPath, data, 'utf-8');
                        throw new Error(`EMERGENCY_SAVE:${emergencyPath}`);
                    } catch (emergencyErr) {
                        if (emergencyErr.message.startsWith('EMERGENCY_SAVE')) throw emergencyErr;
                        try { await fs.promises.unlink(tempPath); } catch (e) { }
                        throw new Error(`Failed to save data: ${err.message} (Backup also failed: ${emergencyErr.message})`);
                    }
                }

                // Backoff (Much faster now: 200, 400, 800, 1600, 2000)
                const delay = Math.min(200 * Math.pow(2, i), 2000);
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    });

    // Update lock and return current write operation
    writeLock = currentWrite.catch(() => { }); // Catch to allow future writes even if this one fails
    return currentWrite;
}

ipcMain.handle('save-local-buffer', async (event, data) => {
    try {
        await safeWriteFile(TEMP_PATH, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving local buffer:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('sync-data', async (event, localData) => {
    try {
        // 1. Read Main DB to get latest state
        let mainData = DEFAULT_DATA;
        if (fs.existsSync(DATA_PATH)) {
            const fileContent = await fs.promises.readFile(DATA_PATH, 'utf-8');
            mainData = parseJSONSafe(fileContent);
        }

        // 2. Differential Merge Logic
        // ... (Merge logic remains same)

        // Helper to merge arrays by ID
        const mergeArrays = (mainArr, localArr) => {
            const merged = [...mainArr];
            localArr.forEach(localItem => {
                const index = merged.findIndex(m => m.id === localItem.id);
                if (index >= 0) {
                    // Update existing
                    merged[index] = localItem;
                } else {
                    // Add new
                    merged.push(localItem);
                }
            });
            return merged;
        };

        const mergedData = {
            ...mainData,
            ...localData, // Settings overwrite
            entries: mergeArrays(mainData.entries || [], localData.entries || []),
            colors: mergeArrays(mainData.colors || [], localData.colors || []),
            materials: mergeArrays(mainData.materials || [], localData.materials || []),
            customers: mergeArrays(mainData.customers || [], localData.customers || []),
            // Categories: Client state (localData) is authoritative for deletions. Overwrite logic.
            // Categories: Client state (localData) is authoritative.
            // Check if property exists in localData to respect deletions (empty arrays).
            materialCategories: (localData.materialCategories !== undefined) ? localData.materialCategories : (mainData.materialCategories || []),
            colorCategories: (localData.colorCategories !== undefined) ? localData.colorCategories : (mainData.colorCategories || []),
        };

        // 3. Write to Main DB
        await safeWriteFile(DATA_PATH, JSON.stringify(mergedData, null, 2));

        return { success: true, syncedPath: DATA_PATH };
    } catch (error) {
        console.error('Sync error:', error);
        return { success: false, error: error.message };
    }
});

// Session Management Handlers (Fast I/O for volatile data)
const SESSION_FILE_NAME = 'session.json';
const SESSION_PATH = path.join(app.getPath('userData'), SESSION_FILE_NAME);

ipcMain.handle('save-session', async (event, data) => {
    try {
        await fs.promises.writeFile(SESSION_PATH, JSON.stringify(data, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving session:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-session', async () => {
    try {
        if (!fs.existsSync(SESSION_PATH)) return null;
        const data = fs.readFileSync(SESSION_PATH, 'utf-8');
        return parseJSONSafe(data);
    } catch (error) {
        console.error('Error reading session:', error);
        return null;
    }
});

// Original Save Handler (kept for backward compatibility or direct saves)
// Original Save Handler (UPDATED: supports partial updates/merging)
ipcMain.handle('save-data', async (event, newData) => {
    try {
        let currentData = {};
        if (fs.existsSync(DATA_PATH)) {
            try {
                const fileContent = await safeReadFile(DATA_PATH);
                currentData = JSON.parse(fileContent);

            } catch (e) {
                // Only treat invalid JSON as corruption. IO Locked errors should abort to protect data.
                if (e instanceof SyntaxError) {
                    console.warn("JSON Syntax Error detected (Corruption):", e);
                    try {
                        const backupPath = DATA_PATH + '.corrupt-' + Date.now();
                        fs.copyFileSync(DATA_PATH, backupPath);
                        console.error(`Corrupt data backup created at: ${backupPath}`);

                        const win = BrowserWindow.getFocusedWindow();
                        if (win) {
                            dialog.showErrorBox(
                                "Data Corruption Detected",
                                `Your database file is invalid (JSON Error). A backup was saved to:\n${backupPath}\n\nThe application will start a new database.`
                            );
                        }
                    } catch (backupErr) {
                        console.error("Backup failed:", backupErr);
                    }
                } else {
                    // IO Error - Abort to prevent overwriting
                    console.warn("Read failed (Locked/Busy) - Aborting merge:", e);
                    throw e;
                }
            }
        }

        // Merge: Incoming keys overwrite existing ones. Missing keys in incoming are preserved.
        const mergedData = { ...currentData, ...newData };

        await safeWriteFile(DATA_PATH, JSON.stringify(mergedData, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving data:', error);

        // Check for Emergency Save Signal
        if (error.message && error.message.startsWith('EMERGENCY_SAVE:')) {
            const savedPath = error.message.split('EMERGENCY_SAVE:')[1];
            try {
                dialog.showMessageBoxSync({
                    type: 'warning',
                    title: 'Database Locked - Saved Copy',
                    message: `The main database file was locked by the network/system.\n\nYour data has been saved to a NEW file:\n${savedPath}\n\nYour recent changes are safe, but check this file.`
                });
            } catch (e) { }
            return { success: true, warning: 'Saved to conflict file' };
        }

        // CRITICAL: Notify user if save fails (e.g. Network Locked or Stale Write)
        // This prevents the "Silent Fail" where user thinks it saved but it didn't.
        try {
            dialog.showErrorBox(
                "Saving Failed",
                `Could not save your changes to the network drive.\n\nError: ${error.message}\n\nPlease check your connection. Your data is currently UNSAVED.`
            );
        } catch (e) { /* ignore */ }

        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-pdf', async (event, { dataBase64, filename }) => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        let defaultDir = app.getPath('documents');

        // Try to read last saved path from config
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                const config = parseJSONSafe(fs.readFileSync(CONFIG_PATH, 'utf-8'));
                if (config.lastPdfPath && fs.existsSync(config.lastPdfPath)) {
                    defaultDir = config.lastPdfPath;
                }
            }
        } catch (e) {
            console.error("Error reading config for pdf path", e);
        }

        const { canceled, filePath } = await dialog.showSaveDialog(win, {
            title: 'Gem Faktura',
            defaultPath: path.join(defaultDir, filename),
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
            ]
        });

        if (canceled || !filePath) {
            return { success: false, canceled: true };
        }

        await fs.promises.writeFile(filePath, Buffer.from(dataBase64, 'base64'));

        // Save new path to config
        try {
            const newDir = path.dirname(filePath);
            let config = {};
            if (fs.existsSync(CONFIG_PATH)) {
                config = parseJSONSafe(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            }
            config.lastPdfPath = newDir;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error("Error saving config with pdf path", e);
        }

        return { success: true, filePath };
    } catch (error) {
        console.error('Error saving PDF:', error);
        return { success: false, error: error.message };
    }
});

// Config Handlers
ipcMain.handle('get-data-path', () => {
    return path.dirname(DATA_PATH);
});

ipcMain.handle('change-data-path', async (event, options = {}) => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: options.title || 'Select Database Folder',
        properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) return { success: false };

    const newDir = filePaths[0];
    const newPath = path.join(newDir, DATA_FILE_NAME);

    // Check if data already exists there
    if (!fs.existsSync(newPath)) {
        // Offer to copy current data
        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: options.buttons || ['Copy current data', 'Start fresh', 'Cancel'],
            title: options.dialogNewLoc || 'New Location',
            message: options.dialogNoDbFound || 'No database found in selected folder.',
            detail: options.dialogCopyAsk || 'Do you want to copy your current data there?'
        });

        if (choice === 2) return { success: false, canceled: true }; // Cancel

        if (choice === 0) {
            // Copy
            try {
                if (fs.existsSync(DATA_PATH)) {
                    fs.copyFileSync(DATA_PATH, newPath);
                } else {
                    fs.writeFileSync(newPath, JSON.stringify(DEFAULT_DATA, null, 2));
                }
            } catch (err) {
                return { success: false, error: 'Could not copy file: ' + err.message };
            }
        } else {
            // Create empty default if choice is 1
            fs.writeFileSync(newPath, JSON.stringify(DEFAULT_DATA, null, 2));
        }
    }

    // Save config
    try {
        const configData = JSON.stringify({ dataPath: newDir }, null, 2);
        fs.writeFileSync(CONFIG_PATH, configData);

        // Also save to BACKUP config in Documents (Survival across updates)
        try {
            const backupPath = path.join(app.getPath('documents'), 'epoxy_config_backup.json');
            fs.writeFileSync(backupPath, configData);
        } catch (bkErr) { console.error("Failed to backup config", bkErr); }

        // Update runtime path
        DATA_PATH = newPath;

        return { success: true, newPath: newDir, requiresRestart: true };
    } catch (e) {
        return { success: false, error: 'Could not save config: ' + e.message };
    }
});

// Start of export-backup (hook for context)
ipcMain.handle('export-backup', async (event, options = {}) => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
        const defaultName = `epoxy_backup_${dateStr}.zip`;

        const { canceled, filePath } = await dialog.showSaveDialog(win, {
            title: options.title || 'Export Backup',
            defaultPath: path.join(app.getPath('documents'), defaultName),
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (canceled || !filePath) return { success: false, canceled: true };

        const zip = new AdmZip();

        // Use provided data (memory snapshot) if available, otherwise read from disk
        if (options.data) {
            zip.addFile(DATA_FILE_NAME, Buffer.from(JSON.stringify(options.data, null, 2)));
        } else {
            // Add the data file from disk
            if (fs.existsSync(DATA_PATH)) {
                zip.addLocalFile(DATA_PATH);
            } else {
                // If no data file, save defaults first
                fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
                zip.addLocalFile(DATA_PATH);
            }
        }

        // Write zip
        zip.writeZip(filePath);
        return { success: true, filePath };
    } catch (error) {
        console.error('Export error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('import-backup', async (event, options = {}) => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: options.title || 'Import Backup',
            filters: [{ name: 'Zip Files', extensions: ['zip'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, canceled: true };

        const zipPath = filePaths[0];
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        // Check for epoxy_data.json
        const dataEntry = zipEntries.find(entry => entry.entryName === DATA_FILE_NAME);
        if (!dataEntry) {
            return { success: false, error: 'Invalid backup: epoxy_data.json missing' };
        }

        // Validate JSON
        const dataStr = zip.readAsText(dataEntry);
        try {
            parseJSONSafe(dataStr);
        } catch (e) {
            return { success: false, error: 'Invalid backup: Data file is corrupt' };
        }

        // Backup current file before overwriting
        if (fs.existsSync(DATA_PATH)) {
            const backupPath = DATA_PATH + '.bak';
            fs.copyFileSync(DATA_PATH, backupPath);
        }

        // Extract (overwrite)
        zip.extractEntryTo(dataEntry, path.dirname(DATA_PATH), false, true);

        return { success: true };
    } catch (error) {
        console.error('Import error:', error);
        return { success: false, error: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();
    createAppMenu();
    startUpdateSchedule();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Listener for Close Confirmation from Renderer (After Save)
ipcMain.on('app-close-confirmed', (event) => {
    if (installAfterSave) {
        installUpdateNow();
        return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.destroy();
});


