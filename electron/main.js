const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

// Logging Setup
const logPath = path.join(app.getPath('userData'), 'app.log');

function logToFile(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type}] ${message}\n`;
    try {
        fs.appendFileSync(logPath, logMessage);
    } catch (err) {
        // Fallback or ignore if logging fails
    }
}

// Override console
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
    logToFile(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'INFO');
    originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
    logToFile(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'ERROR');
    originalConsoleError.apply(console, args);
};

console.log('--- NEW SESSION STARTING - VERSION DEBUG-4 ---');

// Global Error Handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    dialog.showErrorBox('An Unexpected Error Occurred', `Error: ${error.message}\n\nPlease check the logs at ${logPath}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    dialog.showErrorBox('Unhandled Promise Rejection', `Reason: ${reason}\n\nPlease check the logs at ${logPath}`);
});

logToFile('App starting...', 'INFO');

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;

function findFreePort(startPort = 3000) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findFreePort(startPort + 1));
            } else {
                reject(err);
            }
        });
    });
}

function startServer(port) {
    return new Promise((resolve, reject) => {
        if (isDev) {
            resolve('http://localhost:3000');
            return;
        }

        // Path to the standalone server in the packaged app
        // We will configure electron-builder to copy .next/standalone to Resources/server
        const serverPath = path.join(process.resourcesPath, 'server', 'server.js');
        const serverDir = path.join(process.resourcesPath, 'server');

        console.log('Starting server from:', serverPath);
        console.log('Using executable:', process.execPath);

        // DEBUG: List files in server directory to verify copy
        try {
            console.log('Server Directory Contents:', fs.readdirSync(serverDir));
            const nodeModulesPath = path.join(serverDir, 'node_modules');
            if (fs.existsSync(nodeModulesPath)) {
                console.log('node_modules exists. Contents:', fs.readdirSync(nodeModulesPath));
                const nextPath = path.join(nodeModulesPath, 'next');
                console.log('next package exists:', fs.existsSync(nextPath));
            } else {
                console.error('node_modules DOES NOT EXIST in server directory!');
            }
        } catch (e) {
            console.error('Failed to list server directory:', e);
        }

        // Use the Electron binary itself as the Node runtime
        // This works because we set ELECTRON_RUN_AS_NODE=1

        // Load Environment Variables from .env.local
        const env = { ...process.env };
        try {
            const envPath = path.join(process.resourcesPath, 'server', '.env.local');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const envLines = envContent.split('\n');
                for (const line of envLines) {
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, ''); // Simple quote removal
                        if (key && value && !key.startsWith('#')) {
                            env[key] = value;
                            console.log(`Loaded env var: ${key}`);
                        }
                    }
                }
            } else {
                console.warn('No .env.local found in resources path:', envPath);
            }
        } catch (error) {
            console.error('Failed to load .env.local:', error);
        }

        serverProcess = spawn(process.execPath, [serverPath], {
            env: {
                ...env,
                PORT: port,
                HOSTNAME: 'localhost',
                NODE_ENV: 'production',
                ELECTRON_RUN_AS_NODE: '1',
                USER_DATA_PATH: app.getPath('userData')
            },
            cwd: path.join(process.resourcesPath, 'server')
        });

        serverProcess.stdout.on('data', (data) => {
            console.log(`Server: ${data}`);
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`Server Error: ${data}`);
        });

        // Poll until server is ready
        const checkServer = setInterval(() => {
            const client = new net.Socket();
            client.connect(port, 'localhost', () => {
                client.end();
                clearInterval(checkServer);
                resolve(`http://localhost:${port}`);
            });
            client.on('error', () => { });
        }, 100);
    });
}

async function createWindow() {
    try {
        const port = isDev ? 3000 : await findFreePort(3000);

        // DEBUG: Log server directory structure to find missing files
        const serverDir = path.join(process.resourcesPath, 'server');
        console.log('--- SERVER DIR STRUCTURE ---');
        try {
            const logRecursive = (dir, indent = '') => {
                if (!fs.existsSync(dir)) {
                    console.log(`${indent}${dir} [NOT FOUND]`);
                    return;
                }
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const stats = fs.statSync(fullPath);
                    console.log(`${indent}${file}${stats.isDirectory() ? '/' : ''}`);
                    if (stats.isDirectory() && (file === '.next' || file === 'server' || file === 'static')) {
                        logRecursive(fullPath, indent + '  ');
                    }
                }
            };
            logRecursive(serverDir);
        } catch (e) {
            console.error('Failed to log directory:', e);
        }
        console.log('--- END STRUCTURE ---');

        const startUrl = await startServer(port);

        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                preload: path.resolve(__dirname, 'preload.js'), // Use resolve for absolute path
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: false,
                sandbox: false // Disable sandbox to ensure IPC works if having issues
            }
        });

        mainWindow.loadURL(startUrl).catch(err => {
            console.error('Failed to load URL:', err);
            dialog.showErrorBox('Load Error', `Failed to load application URL: ${err.message}`);
        });

        // Handle File Downloads (Crucial for "Web Mode" fallback or Blob downloads)
        mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
            // Set save path dialog options if needed, or let standard behavior happen (prompt)
            // item.setSavePath(...) 
            // Just ensuring we don't block it.
            console.log('Download started:', item.getFilename());
            item.on('updated', (event, state) => {
                if (state === 'interrupted') {
                    console.log('Download is interrupted but can be resumed');
                } else if (state === 'progressing') {
                    if (item.isPaused()) {
                        console.log('Download is paused');
                    } else {
                        console.log(`Received bytes: ${item.getReceivedBytes()}`);
                    }
                }
            });
            item.once('done', (event, state) => {
                if (state === 'completed') {
                    console.log('Download successfully');
                } else {
                    console.log(`Download failed: ${state}`);
                    dialog.showErrorBox('Download Failed', `Failed to download ${item.getFilename()}`);
                }
            });
        });

        mainWindow.on('closed', function () {
            mainWindow = null;
        });
    } catch (error) {
        console.error('Failed to create window:', error);
        dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}\n\nPlease check the logs at ${logPath}`);
        app.quit();
    }
}

app.on('ready', createWindow);

app.on('will-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC Listener for File Dialog
ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        defaultPath: app.getPath('documents'), // User Request: Default to Documents
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp', 'heic'] }
        ]
    });

    if (canceled) {
        return { canceled, files: [] };
    } else {
        // We need to return the file path AND ideally the base64 content
        // because the browser cannot access local files by path easily due to security.
        // Or we can let the browser try to fetch it if webSecurity is off (not recommended for prod but okay for MVP).
        // Let's return the basic info and let the frontend decide.
        // Actually, reading file in main is safer.

        const files = filePaths.map(filePath => {
            const fileName = path.basename(filePath);
            const fileBuffer = fs.readFileSync(filePath);
            // Return base64 for immediate display/upload usage
            return {
                name: fileName,
                path: filePath,
                type: 'image/' + path.extname(filePath).substring(1), // Simple mime guess
                data: `data:image/${path.extname(filePath).substring(1)};base64,${fileBuffer.toString('base64')}`
            };
        });

        return { canceled, files };
    }
});

// IPC Listener for Bulk Save (Desktop Download All)
ipcMain.handle('download:saveFiles', async (event, files) => {
    // files = [{ url, filename }]
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Destination Folder',
        defaultPath: app.getPath('downloads'),
        properties: ['openDirectory', 'createDirectory']
    });

    if (canceled || filePaths.length === 0) {
        return { canceled: true };
    }

    const destFolder = filePaths[0];
    let successCount = 0;

    for (const file of files) {
        try {
            const destPath = path.join(destFolder, file.filename);

            // Handle Base64 Data URLs
            if (file.url.startsWith('data:')) {
                const base64Data = file.url.split(';base64,').pop();
                fs.writeFileSync(destPath, base64Data, { encoding: 'base64' });
                successCount++;
            }
            // Handle Remote URLs
            else {
                // Use fetch for simplicity (Electron 18+ has native fetch/node-fetch)
                const response = await fetch(file.url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                fs.writeFileSync(destPath, buffer);
                successCount++;
            }
        } catch (error) {
            console.error(`Failed to save ${file.filename}:`, error);
        }
    }

    return { canceled: false, successCount };
});
