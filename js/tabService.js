export class TabService {
    constructor(container, api, onTabSelect) {
        this.container = container;
        this.api = api;
        this.onTabSelect = onTabSelect;
        this.tabs = []; // { id, title, path, content, scrollTop, cursorPos, isUnsaved }
        this.activeTabId = null;
    }

    async init(config) {
        window.log('TabService: Initializing session...');
        if (config.openedTabs && config.openedTabs.length > 0) {
            for (let t of config.openedTabs) {
                if (t.path) {
                    const res = await this.api.readFile(t.path);
                    if (res) {
                        this.addTab(res.path, res.content, false, false);
                    }
                }
            }
        }

        if (this.tabs.length === 0) {
            this.addTab(null, '', false, true); // Untitled
        } else {
            this.selectTab(this.tabs[0].id);
        }
    }

    addTab(filePath, content, isUnsaved = false, selectImmediately = true) {
        // Ensure not already opened
        const existing = this.tabs.find(t => t.path === filePath && filePath);
        if (existing) {
            window.log('TabService: Tab already open, selecting existing:', filePath);
            this.selectTab(existing.id);
            return existing;
        }

        if (this.tabs.length >= 20) {
            window.log('TabService: Max tabs reached');
            return null;
        }

        const id = Date.now().toString() + Math.random().toString().slice(2, 5);
        const title = filePath ? filePath.split(/[/\\]/).pop() : 'Untitled.md';

        const tab = {
            id,
            title,
            path: filePath,
            content,
            scrollTop: 0,
            cursorPos: 0,
            isUnsaved
        };

        this.tabs.push(tab);
        window.log('TabService: Added new tab:', title);
        this.renderTabs();

        if (selectImmediately) this.selectTab(id);
        return tab;
    }

    selectTab(id) {
        if (this.activeTabId === id) return;

        // Save current active tab state before switching (if editor is available globally for cursor)
        const currentTab = this.getActiveTab();
        const editor = document.getElementById('editor');
        if (currentTab && editor) {
            currentTab.cursorPos = editor.selectionStart;
            currentTab.scrollTop = editor.scrollTop;
            window.log(`TabService: Saved state for ${currentTab.title} (Pos: ${currentTab.cursorPos}, Scroll: ${currentTab.scrollTop})`);
        }

        this.activeTabId = id;
        this.renderTabs();

        const tab = this.tabs.find(t => t.id === id);
        if (tab && this.onTabSelect) {
            this.onTabSelect(tab);
        }
    }

    closeTab(id) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index > -1) {
            const closingTab = this.tabs[index];
            if (closingTab.isUnsaved && !confirm(`File "${closingTab.title}" has unsaved changes. Close anyway?`)) {
                return;
            }

            this.tabs.splice(index, 1);
            window.log('TabService: Closed tab:', closingTab.title);

            if (this.tabs.length === 0) {
                this.addTab(null, '');
            } else if (this.activeTabId === id) {
                const nextTab = this.tabs[Math.max(0, index - 1)];
                this.selectTab(nextTab.id);
            } else {
                this.renderTabs();
            }
        }
    }

    updateActiveTab(content, isUnsaved, path = null) {
        const tab = this.tabs.find(t => t.id === this.activeTabId);
        if (tab) {
            tab.content = content;
            tab.isUnsaved = isUnsaved;
            if (path) {
                tab.path = path;
                tab.title = path.split(/[/\\]/).pop();
            }
            this.renderTabs();
        }
    }

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    getSavableState() {
        return this.tabs.map(t => ({ path: t.path }));
    }

    renderTabs() {
        this.container.innerHTML = '';
        this.tabs.forEach(t => {
            const div = document.createElement('div');
            div.className = `tab ${t.id === this.activeTabId ? 'active' : ''} ${t.isUnsaved ? 'unsaved' : ''}`;
            div.setAttribute('title', t.path || 'Unsaved File');

            div.innerHTML = `
                <span class="tab-title">${t.title}</span>
                <span class="tab-close" title="Close Tab">×</span>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-close')) {
                    this.closeTab(t.id);
                } else {
                    this.selectTab(t.id);
                }
            });

            div.addEventListener('mouseup', (e) => {
                if (e.button === 1) { // Middle click
                    e.preventDefault();
                    this.closeTab(t.id);
                }
            });

            this.container.appendChild(div);
        });

        // Ensure active tab is visible in scrollable bar
        const activeElem = this.container.querySelector('.tab.active');
        if (activeElem) activeElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
