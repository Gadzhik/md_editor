import { SettingsService } from './js/settingsService.js';
import { FileService } from './js/fileService.js';
import { ScrollSync } from './js/scrollSync.js';
import { ExportService } from './js/exportService.js';
import { EditorService } from './js/editorService.js';
import { FileTreeService } from './js/fileTreeService.js';
import { TabService } from './js/tabService.js';
import { GitService } from './js/gitService.js';

// V4 AI Imports
import { ModelManager } from './js/ai/modelManager.js';
import { PromptBuilder } from './js/ai/promptBuilder.js';
import { ContextManager } from './js/ai/contextManager.js';
import { AiService } from './js/ai/aiService.js';
import { AiChatService } from './js/ai/aiChatService.js';
import { InlineAssistant } from './js/ai/inlineAssistant.js';

// --- Logger (V4 Debug) ---
window.log = (...args) => {
    if (window.debugEnabled) {
        console.log(`[RENDERER DEBUG] ${new Date().toLocaleTimeString()}:`, ...args);
    }
};

// DOM Elements
const editorElem = document.getElementById('editor');
const previewElem = document.getElementById('preview');
const fileNameDisplay = document.getElementById('file-name');
const statsDisplay = document.getElementById('stats');
const searchInput = document.getElementById('search-input');
const saveStatus = document.getElementById('save-status');
const gitStatus = document.getElementById('git-status');
const recentFilesSelect = document.getElementById('recent-files');

const treeContainer = document.getElementById('file-tree');
const tabsContainer = document.getElementById('tabs-container');

const ctxMenu = document.createElement('div');
ctxMenu.className = 'context-menu';
document.body.appendChild(ctxMenu);

// Services
const settingsService = new SettingsService(window.api);
const fileService = new FileService(window.api, (status) => { saveStatus.textContent = status; });
const exportService = new ExportService(window.api);
const editorService = new EditorService(editorElem, previewElem, statsDisplay, window.api);
const fileTreeService = new FileTreeService(window.api, treeContainer, ctxMenu);
const gitService = new GitService(window.api, (s) => gitStatus.textContent = s, (show) => {
    document.getElementById('btn-git-diff').style.display = show ? 'block' : 'none';
});

let tabService;
let scrollSync;

// AI V4 Globals
let modelManager;
let promptBuilder;
let contextManager;
let aiService;
let aiChatService;
let inlineAssistant;

async function init() {
    window.log('Initializing V4 Application...');

    // Config Load
    const config = await settingsService.init();
    window.debugEnabled = config.debugMode;
    window.log('Config loaded:', config);

    settingsService.applyTheme(config.theme);
    refreshRecentFiles(config.recentFiles);

    if (config.zenMode) toggleZenMode(true);

    // Tab Service Init
    tabService = new TabService(tabsContainer, window.api, (tab) => {
        window.log('Tab selected:', tab.id, tab.title);
        editorElem.value = tab.content;
        editorService.updatePreview();
        fileNameDisplay.textContent = tab.title;

        // Restore scroll and cursor if possible
        if (tab.cursorPos) {
            editorElem.selectionStart = tab.cursorPos;
            editorElem.selectionEnd = tab.cursorPos;
        }
        if (tab.scrollTop !== undefined) {
            editorElem.scrollTop = tab.scrollTop;
            // Trigger sync
            requestAnimationFrame(() => scrollSync.syncEditorToPreview());
        }

        requestAnimationFrame(() => {
            if (window.mermaidRenderer) window.mermaidRenderer.run({ nodes: previewElem.querySelectorAll('.mermaid') });
        });

        fileService.currentFilePath = tab.path;
        settingsService.update({ openedTabs: tabService.getSavableState() });
    });

    await tabService.init(config);
    scrollSync = new ScrollSync(editorElem, previewElem);

    // File Tree binding
    fileTreeService.onFileSelect = async (path) => {
        window.log('File selected from tree:', path);
        const res = await fileService.openRecentFile(path);
        if (res) tabService.addTab(res.path, res.content, false, true);
    };

    // Editor Input Events -> Tabs & AutoSave
    let debounceTimer;
    editorElem.addEventListener('input', () => {
        editorService.updatePreview();
        tabService.updateActiveTab(editorElem.value, true);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (window.mermaidRenderer) window.mermaidRenderer.run({ nodes: previewElem.querySelectorAll('.mermaid') }).catch(() => { });
        }, 500);

        fileService.scheduleAutoSave(editorElem.value, settingsService.config);
    });

    // Save scroll pos on change
    editorElem.addEventListener('scroll', () => {
        const active = tabService.getActiveTab();
        if (active) {
            active.scrollTop = editorElem.scrollTop;
        }
    });

    // V4 AI Setup
    await initAI(config);

    // --- Menu Actions Integration (V4 Fix) ---
    window.api.onMenuTrigger((action) => {
        window.log('Menu action triggered:', action);
        handleMenuAction(action);
    });
}

function handleMenuAction(action) {
    switch (action) {
        case 'open-file': document.getElementById('btn-open').click(); break;
        case 'open-folder': document.getElementById('btn-open-folder').click(); break;
        case 'save-file': document.getElementById('btn-save').click(); break;
        case 'export-html': document.getElementById('btn-export-html').click(); break;
        case 'export-pdf': document.getElementById('btn-export-pdf').click(); break;
        case 'find': editorService.focusSearch(searchInput); break;
        case 'toggle-zen': toggleZenMode(); break;
        case 'toggle-theme': document.getElementById('btn-theme').click(); break;
        case 'open-ai-chat': aiChatService.toggle(true); break;
        case 'open-ai-settings': document.getElementById('btn-ai-settings').click(); break;
        case 'git-diff': gitService.viewDiff(); break;
        default: window.log('Unknown menu action:', action);
    }
}

async function initAI(config) {
    window.log('Initializing AI Services...');
    modelManager = new ModelManager(window.api, config);
    promptBuilder = new PromptBuilder(window.api);
    await promptBuilder.init();

    contextManager = new ContextManager(editorElem, tabService, modelManager);
    aiService = new AiService(window.api, modelManager);

    const uiSidebar = document.getElementById('ai-sidebar');
    const toggleBtn = document.getElementById('btn-ai-chat');
    aiChatService = new AiChatService(aiService, uiSidebar, toggleBtn);

    inlineAssistant = new InlineAssistant(window.api, aiService, promptBuilder, contextManager, editorService);

    // Settings Modal Data
    const elModal = document.getElementById('ai-settings-modal');
    document.getElementById('btn-ai-settings').addEventListener('click', () => {
        const aiC = modelManager.getConfig();
        document.getElementById('ai-provider').value = aiC.provider;
        document.getElementById('ai-endpoint').value = aiC.endpoint;
        document.getElementById('ai-system').value = aiC.systemPrompt;
        elModal.style.display = 'block';

        // Update default endpoint when provider changes
        const provSelect = document.getElementById('ai-provider');
        const endpInput = document.getElementById('ai-endpoint');

        // Remove old listener if exists to avoid double binds if we don't manage it elsewhere, 
        // but here we can just bind once in initAI if we want. Let's bind it once.
    });

    document.getElementById('ai-provider').addEventListener('change', (e) => {
        const prov = e.target.value;
        const endpInput = document.getElementById('ai-endpoint');
        if (prov === 'ollama') {
            endpInput.value = 'http://localhost:11434';
        } else if (prov === 'lmstudio') {
            endpInput.value = 'http://localhost:1234';
        }
    });

    document.getElementById('btn-ai-refresh').addEventListener('click', async () => {
        const prov = document.getElementById('ai-provider').value;
        const endp = document.getElementById('ai-endpoint').value;
        window.log('Testing AI connection to:', endp);

        await modelManager.updateConfig({ provider: prov, endpoint: endp }, settingsService.update.bind(settingsService));

        const status = document.getElementById('ai-status');
        status.textContent = "Status: Testing connection...";
        status.style.color = '#ffaa00';

        const isOk = await modelManager.checkConnection();
        if (isOk) {
            window.log('AI Connection OK');
            status.textContent = "Status: Connected!";
            status.style.color = '#00aa00';
            const models = await modelManager.getModels();
            const sel = document.getElementById('ai-model');
            sel.innerHTML = '';
            models.forEach(m => {
                const o = document.createElement('option');
                o.value = m; o.textContent = m;
                if (m === modelManager.getConfig().model) o.selected = true;
                sel.appendChild(o);
            });
        } else {
            window.log('AI Connection FAILED');
            status.textContent = "Status: Connection Failed!";
            status.style.color = '#cc0000';
        }
    });

    const closeAiSettings = () => {
        elModal.style.display = 'none';
        window.log('AiSettings: Modal closed');
    };

    document.getElementById('btn-ai-save').addEventListener('click', async () => {
        const newConf = {
            provider: document.getElementById('ai-provider').value,
            endpoint: document.getElementById('ai-endpoint').value,
            model: document.getElementById('ai-model').value || modelManager.getConfig().model,
            systemPrompt: document.getElementById('ai-system').value
        };
        window.log('Saving AI Config:', newConf);
        await modelManager.updateConfig(newConf, settingsService.update.bind(settingsService));

        // Visual feedback
        const btn = document.getElementById('btn-ai-save');
        const originalText = btn.textContent;
        btn.textContent = "Saved!";
        btn.style.background = "#00aa00";
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = "";
            closeAiSettings();
        }, 800);
    });

    // V4 UX Fix: Close on click outside
    elModal.addEventListener('click', (e) => {
        if (e.target === elModal) closeAiSettings();
    });
}

function refreshRecentFiles(files) {
    recentFilesSelect.innerHTML = '<option value="" disabled selected>Recent...</option>';
    if (files) {
        files.forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f.split(/[/\\]/).pop().slice(0, 30); opt.title = f;
            recentFilesSelect.appendChild(opt);
        });
    }
}

document.getElementById('btn-open-folder').addEventListener('click', async () => {
    const folderPath = await window.api.selectFolder();
    if (folderPath) {
        window.log('Folder opened:', folderPath);
        await fileTreeService.openFolder(folderPath);
        await gitService.init(folderPath, settingsService.config);
    }
});

document.getElementById('btn-theme').addEventListener('click', async () => {
    const newTheme = settingsService.config.theme === 'dark' ? 'light' : 'dark';
    window.log('Switching theme to:', newTheme);
    settingsService.applyTheme(newTheme);
    await settingsService.update({ theme: newTheme });
});

document.getElementById('btn-open').addEventListener('click', async () => {
    const res = await fileService.openFile();
    if (res) tabService.addTab(res.path, res.content, false, true);
});

document.getElementById('btn-save').addEventListener('click', async () => {
    const active = tabService.getActiveTab();
    if (!active) return;
    const path = await fileService.saveFile(editorElem.value);
    if (path) {
        tabService.updateActiveTab(editorElem.value, false, path);
        window.api.getConfig().then(c => refreshRecentFiles(c.recentFiles));
    }
});

recentFilesSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
        const res = await fileService.openRecentFile(e.target.value);
        if (res) tabService.addTab(res.path, res.content, false, true);
    }
    recentFilesSelect.value = "";
});

document.getElementById('btn-zen-mode').addEventListener('click', () => toggleZenMode());
function toggleZenMode(forceState = null) {
    const isZen = forceState !== null ? forceState : !document.body.classList.contains('zen-mode');
    window.log('Zen Mode:', isZen);
    if (isZen) document.body.classList.add('zen-mode');
    else document.body.classList.remove('zen-mode');
    settingsService.update({ zenMode: isZen });

    // Optimization: resize editor when UI changes
    if (editorElem) editorElem.focus();
}

document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    window.log('Exporting PDF...');
    await exportService.exportPdf();
});
document.getElementById('btn-export-html').addEventListener('click', async () => {
    window.log('Exporting HTML...');
    await exportService.exportHtml(previewElem);
});

document.getElementById('btn-search').addEventListener('click', () => { if (searchInput.value) window.find(searchInput.value); });
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && searchInput.value) window.find(searchInput.value); });

document.getElementById('btn-git-diff').addEventListener('click', () => gitService.viewDiff());

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); }
    if (e.ctrlKey && e.key === 'o') { e.preventDefault(); document.getElementById('btn-open').click(); }
    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); editorService.focusSearch(searchInput); }
    if (e.key === 'F11') { e.preventDefault(); toggleZenMode(); }
    if (e.ctrlKey && e.key === 'b') { e.preventDefault(); editorService.wrapSelection('**', '**'); }
    if (e.ctrlKey && e.key === 'i') { e.preventDefault(); editorService.wrapSelection('*', '*'); }

    // V4 UX Fix: Close modals on Escape
    if (e.key === 'Escape') {
        const aiModal = document.getElementById('ai-settings-modal');
        if (aiModal.style.display === 'block') {
            aiModal.style.display = 'none';
            window.log('AiSettings: Escaped modal');
        }
    }
});

init();
