const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

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

        console.log('Starting server from:', serverPath);
        console.log('Using executable:', process.execPath);

        // Use the Electron binary itself as the Node runtime
        // This works because we set ELECTRON_RUN_AS_NODE=1
        serverProcess = spawn(process.execPath, [serverPath], {
            env: {
                ...process.env,
                PORT: port,
                HOSTNAME: 'localhost',
                NODE_ENV: 'production',
                ELECTRON_RUN_AS_NODE: '1'
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
    const port = isDev ? 3000 : await findFreePort(3000);
    const startUrl = await startServer(port);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });

    mainWindow.loadURL(startUrl);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
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
