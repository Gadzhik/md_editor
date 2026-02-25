const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const markdownItTaskLists = require('markdown-it-task-lists');
const mk = require('markdown-it-katex');

const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try { return hljs.highlight(str, { language: lang }).value; } catch (__) { }
        }
        return '';
    }
}).use(markdownItTaskLists).use(mk, { throwOnError: false, errorColor: '#cc0000' });

md.core.ruler.push('source_map_inject', function (state) {
    state.tokens.forEach(function (token) {
        if (token.map && token.type !== 'inline') {
            token.attrPush(['data-line', String(token.map[0])]);
        }
    });
});

const defaultRender = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
};

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    if (token.info.trim() === 'mermaid') {
        return `<div class="mermaid">${token.content}</div>`;
    }
    return defaultRender(tokens, idx, options, env, self);
};

// Safe invoker unwraps the { ok, data, error } object pattern from main.js
async function safeInvoke(channel, ...args) {
    try {
        const payload = await ipcRenderer.invoke(channel, ...args);
        if (payload && typeof payload === 'object' && 'ok' in payload) {
            if (!payload.ok) {
                console.warn(`[API ERROR] ${channel}:`, payload.error);
                return null; // Return null on handled failure gracefully to renderer
            }
            return payload.data;
        }
        return payload; // Fallback back-compat
    } catch (e) {
        console.error(`[API FATAL] ${channel}:`, e);
        return null;
    }
}

contextBridge.exposeInMainWorld('api', {
    getConfig: () => safeInvoke('get-config'),
    saveConfig: (config) => safeInvoke('save-config', config),

    openFileDialog: () => safeInvoke('open-file-dialog'),
    saveFileDialog: (data) => safeInvoke('save-file-dialog', data),
    saveFileAuto: (data) => safeInvoke('save-file-auto', data),
    readFile: (filePath) => safeInvoke('read-file', filePath),

    exportPdf: () => safeInvoke('export-pdf'),
    exportHtml: (htmlContent) => safeInvoke('export-html', htmlContent),

    selectFolder: () => safeInvoke('select-folder'),
    readDir: (dirPath) => safeInvoke('read-dir', dirPath),
    createFile: (filePath) => safeInvoke('create-file', filePath),
    createFolder: (dirPath) => safeInvoke('create-folder', dirPath),
    renameItem: (oldP, newP) => safeInvoke('rename-item', oldP, newP),
    deleteItem: (p) => safeInvoke('delete-item', p),

    gitCheck: (dir) => safeInvoke('git-check', dir),
    gitInit: (dir) => safeInvoke('git-init', dir),
    gitCommit: (dir) => safeInvoke('git-commit', dir),
    gitDiff: (dir) => safeInvoke('git-diff', dir),

    renderMarkdown: (text) => {
        try { return md.render(text); } catch (err) { return `<div style="color:red">Render Error: ${err.message}</div>`; }
    },

    // AI Methods
    aiFetch: (data) => safeInvoke('ai-fetch', data),
    getPrompts: () => safeInvoke('get-prompts'),
    startAiStream: (data) => ipcRenderer.send('ai-stream-start', data),
    stopAiStream: (id) => ipcRenderer.send('ai-stream-stop', id),
    onAiStreamChunk: (id, callback) => {
        const channel = `ai-stream-chunk-${id}`;
        const cb = (event, data) => callback(data);
        ipcRenderer.on(channel, cb);
        return { channel, cb };
    },
    onAiStreamDone: (id, callback) => {
        const channel = `ai-stream-done-${id}`;
        const cb = () => callback();
        ipcRenderer.on(channel, cb);
        return { channel, cb };
    },
    onAiStreamError: (id, callback) => {
        const channel = `ai-stream-error-${id}`;
        const cb = (event, data) => callback(data.error);
        ipcRenderer.on(channel, cb);
        return { channel, cb };
    },
    removeListener: (listenerObj) => {
        ipcRenderer.removeListener(listenerObj.channel, listenerObj.cb);
    },

    // Menu Listener
    onMenuTrigger: (callback) => {
        ipcRenderer.on('menu-action', (event, action) => callback(action));
    },

    // Utilities for Link Handling
    joinPath: (...args) => path.join(...args),
    dirname: (p) => path.dirname(p),
    openExternal: (url) => shell.openExternal(url)
});
