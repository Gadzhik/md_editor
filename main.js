const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

let mainWindow;
const configPath = path.join(app.getPath('userData'), 'config.json');
const promptsPath = path.join(app.getPath('userData'), 'prompts');

const defaultConfig = {
    theme: 'dark',
    autoSave: true,
    autoSaveDelay: 7000,
    autoSaveBackups: true,
    zenMode: false,
    gitAutoCommit: true,
    gitCommitInterval: 60000,
    debugMode: true, // V4 debug mode enabled by default
    recentFiles: [],
    openedTabs: [],
    lastDirectory: null, // V4 persistence fix
    aiConfig: {
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'mistral',
        temperature: 0.7,
        maxTokens: 2048,
        systemPrompt: 'You are a helpful Markdown writing assistant.',
        allowFullDocumentContext: false
    }
};

// --- Logger (V4 Debug) ---
function log(...args) {
    const config = getConfig();
    if (config.debugMode) {
        console.log(`[MAIN DEBUG] ${new Date().toISOString()}:`, ...args);
    }
}

// Ensure directories and default configs
function ensurePaths() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        log('Created default config.json');
    }
    if (!fs.existsSync(promptsPath)) {
        fs.mkdirSync(promptsPath, { recursive: true });
        fs.writeFileSync(path.join(promptsPath, 'rewrite.txt'), 'You are an expert editor. Please rewrite the following text to improve clarity, flow, and professionalism. Do not add new information, and preserve the original meaning.\n\nText:\n{{text}}');
        fs.writeFileSync(path.join(promptsPath, 'summarize.txt'), 'Please provide a concise summary of the following text. Highlight the key points in a bulleted list.\n\nText:\n{{text}}');
        fs.writeFileSync(path.join(promptsPath, 'explain_code.txt'), 'Please explain the following code blocks or technical text in simple, clear terms.\n\nText:\n{{text}}');
        fs.writeFileSync(path.join(promptsPath, 'improve_style.txt'), 'Please refine the following text to have a more engaging and polished writing style. Fix any grammatical errors.\n\nText:\n{{text}}');
        log('Created default AI prompts');
    }
}
ensurePaths();

function getConfig() {
    try {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (!data.aiConfig) data.aiConfig = defaultConfig.aiConfig;
        if (data.debugMode === undefined) data.debugMode = true;
        return { ...defaultConfig, ...data };
    } catch (e) {
        console.error('[MAIN ERROR] Failed to parse config:', e);
        return defaultConfig;
    }
}

function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        log('Config saved successfully');
    } catch (e) {
        console.error('[MAIN ERROR] Failed to save config:', e);
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        autoHideMenuBar: false // Required to show the new Menu
    });
    mainWindow.loadFile('index.html');
    buildAppMenu();
    log('Main window created');
}

// --- Electron Application Menu (V4 Fix) ---
function buildAppMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                { label: 'Open File', accelerator: 'CmdOrCtrl+O', click: () => { log('Menu: Open File'); mainWindow.webContents.send('menu-action', 'open-file'); } },
                { label: 'Open Folder', accelerator: 'CmdOrCtrl+Shift+O', click: () => { log('Menu: Open Folder'); mainWindow.webContents.send('menu-action', 'open-folder'); } },
                { type: 'separator' },
                { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => { log('Menu: Save'); mainWindow.webContents.send('menu-action', 'save-file'); } },
                { type: 'separator' },
                { label: 'Export HTML', click: () => mainWindow.webContents.send('menu-action', 'export-html') },
                { label: 'Export PDF', click: () => mainWindow.webContents.send('menu-action', 'export-pdf') },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                { label: 'Find/Search', accelerator: 'CmdOrCtrl+F', click: () => mainWindow.webContents.send('menu-action', 'find') }
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Toggle Zen Mode', accelerator: 'F11', click: () => mainWindow.webContents.send('menu-action', 'toggle-zen') },
                { label: 'Toggle Theme', click: () => mainWindow.webContents.send('menu-action', 'toggle-theme') },
                { type: 'separator' },
                { role: 'reload' },
                { role: 'toggleDevTools' }
            ]
        },
        {
            label: 'AI',
            submenu: [
                { label: 'Open AI Chat', click: () => mainWindow.webContents.send('menu-action', 'open-ai-chat') },
                { label: 'AI Settings', click: () => mainWindow.webContents.send('menu-action', 'open-ai-settings') }
            ]
        },
        {
            label: 'Git',
            submenu: [
                { label: 'View Diff', click: () => mainWindow.webContents.send('menu-action', 'git-diff') }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });


// --- Safe IPC Wrapper (V4 Audit Fix) ---
function safeHandle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
        try {
            log(`IPC Request: ${channel}`, args.length > 0 ? (args[0] && args[0].content ? '[CONTENT_TRUNCATED]' : args) : '');
            const result = await handler(event, ...args);
            return { ok: true, data: result };
        } catch (error) {
            console.error(`[IPC ERROR] Channel: ${channel} | Error: ${error.message}`);
            return { ok: false, error: error.message };
        }
    });
}

// Config IPCs
safeHandle('get-config', () => getConfig());
safeHandle('save-config', (event, configPatch) => {
    const config = getConfig();
    const updated = { ...config, ...configPatch };
    saveConfig(updated);
    return updated;
});

// AI Prompts
safeHandle('get-prompts', () => {
    const files = fs.readdirSync(promptsPath).filter(f => f.endsWith('.txt'));
    return files.map(f => ({
        name: f.replace('.txt', ''),
        content: fs.readFileSync(path.join(promptsPath, f), 'utf-8')
    }));
});

// AI IPC streaming & fetch
safeHandle('ai-fetch', async (event, { endpoint, method = 'GET', payload = null }) => {
    const options = { method, headers: {} };
    if (payload) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
    }
    const response = await fetch(endpoint, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json();
});

const abortControllers = new Map();

ipcMain.on('ai-stream-start', async (event, { id, endpoint, payload, provider }) => {
    log(`AI Stream Start: ${id} -> ${endpoint}`);
    const ac = new AbortController();
    abortControllers.set(id, ac);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: ac.signal
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);

        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                event.sender.send(`ai-stream-chunk-${id}`, { chunk });
            }
        } else {
            response.body.on('data', chunk => {
                event.sender.send(`ai-stream-chunk-${id}`, { chunk: chunk.toString() });
            });
            await new Promise((resolve) => response.body.on('end', resolve));
        }
        event.sender.send(`ai-stream-done-${id}`);
        log(`AI Stream Done: ${id}`);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`[AI STREAM ERROR] ${id}:`, error.message);
            event.sender.send(`ai-stream-error-${id}`, { error: error.message });
        } else {
            log(`AI Stream Aborted: ${id}`);
        }
    } finally {
        abortControllers.delete(id);
    }
});

ipcMain.on('ai-stream-stop', (event, id) => {
    if (abortControllers.has(id)) {
        abortControllers.get(id).abort();
        abortControllers.delete(id);
        log(`AI Stream Stopped manually: ${id}`);
    }
});

// IPC: File Operations
safeHandle('open-file-dialog', async () => {
    const config = getConfig();
    let defaultPath = config.lastDirectory;
    if (defaultPath && !fs.existsSync(defaultPath)) defaultPath = undefined;

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Markdown File (Pick a file to edit)',
        filters: [
            { name: 'Markdown Files', extensions: ['md', 'markdown'] },
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile'],
        defaultPath: defaultPath || undefined
    });
    if (canceled || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    const dir = path.dirname(filePath);

    // Save last directory
    saveConfig({ ...config, lastDirectory: dir });

    addToRecent(filePath);
    return { path: filePath, content: fs.readFileSync(filePath, 'utf-8') };
});

safeHandle('save-file-dialog', async (event, { filePath, content }) => {
    const config = getConfig();
    if (!filePath) {
        let defaultPath = config.lastDirectory;
        if (defaultPath && !fs.existsSync(defaultPath)) defaultPath = undefined;

        const { canceled, filePath: savePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Markdown File',
            filters: [
                { name: 'Markdown', extensions: ['md'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            defaultPath: defaultPath || undefined
        });
        if (canceled || !savePath) return null;
        filePath = savePath;
    }

    const dir = path.dirname(filePath);
    saveConfig({ ...config, lastDirectory: dir });

    fs.writeFileSync(filePath, content, 'utf-8');
    addToRecent(filePath);
    return filePath;
});

safeHandle('save-file-auto', async (event, { filePath, content, makeBackup }) => {
    if (!filePath) return false;
    if (makeBackup) {
        const date = new Date();
        const pad = n => String(n).padStart(2, '0');
        const timestamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
        const backupPath = `${filePath}.backup-${timestamp}`;
        fs.copyFileSync(filePath, backupPath);
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    addToRecent(filePath);
    return true;
});

safeHandle('read-file', (event, filePath) => {
    if (fs.existsSync(filePath)) {
        addToRecent(filePath);
        return { path: filePath, content: fs.readFileSync(filePath, 'utf-8') };
    }
    throw new Error('File does not exist');
});

// IPC: Exports
safeHandle('export-pdf', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export PDF',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    const data = await mainWindow.webContents.printToPDF({
        printBackground: false,
        pageSize: 'A4',
        margins: { marginType: 'default' }
    });
    fs.writeFileSync(filePath, data);
    return filePath;
});

safeHandle('export-html', async (event, htmlContent) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Export HTML',
        filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (canceled || !filePath) return null;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:2rem;max-width:800px;margin:0 auto;}</style></head><body>${htmlContent}</body></html>`;
    fs.writeFileSync(filePath, fullHtml, 'utf-8');
    return filePath;
});

// IPC: File Tree
safeHandle('read-dir', async (event, dirPath) => {
    log(`Reading directory: ${dirPath}`);
    if (!dirPath || !fs.existsSync(dirPath)) {
        log(`Directory does not exist: ${dirPath}`);
        return [];
    }
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    return items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        path: path.join(dirPath, item.name)
    })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
    });
});

safeHandle('create-file', async (event, filePath) => {
    fs.writeFileSync(filePath, '');
    return true;
});

safeHandle('create-folder', async (event, dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
});

safeHandle('rename-item', async (event, oldPath, newPath) => {
    fs.renameSync(oldPath, newPath);
    return true;
});

safeHandle('delete-item', async (event, itemPath) => {
    fs.rmSync(itemPath, { recursive: true, force: true });
    return true;
});

safeHandle('select-folder', async () => {
    const config = getConfig();
    let defaultPath = config.lastDirectory;
    if (defaultPath && !fs.existsSync(defaultPath)) defaultPath = undefined;

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Project Folder (Files will appear in Sidebar)',
        properties: ['openDirectory'],
        defaultPath: defaultPath || undefined
    });
    if (canceled || filePaths.length === 0) return null;

    const folderPath = filePaths[0];
    saveConfig({ ...config, lastDirectory: folderPath });

    return folderPath;
});

// IPC: Git Operations
safeHandle('git-check', async (event, dir) => {
    const git = simpleGit(dir);
    return await git.checkIsRepo();
});

safeHandle('git-init', async (event, dir) => {
    const git = simpleGit(dir);
    await git.init();
    return true;
});

safeHandle('git-commit', async (event, dir) => {
    const git = simpleGit(dir);
    const status = await git.status();
    if (status.files.length > 0) {
        await git.add('.');
        const date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        await git.commit(`Auto-save: ${date}`);
        log(`Git Auto-commited at ${date} in ${dir}`);
        return true;
    }
    return false;
});

safeHandle('git-diff', async (event, dir) => {
    shell.openPath(dir);
    return true;
});

function addToRecent(filePath) {
    const config = getConfig();
    const index = config.recentFiles.indexOf(filePath);
    if (index > -1) config.recentFiles.splice(index, 1);
    config.recentFiles.unshift(filePath);
    if (config.recentFiles.length > 10) config.recentFiles.pop();
    saveConfig(config);
}
