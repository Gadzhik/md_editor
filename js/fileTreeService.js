export class FileTreeService {
    constructor(api, treeContainer, contextMenuContainer) {
        this.api = api;
        this.container = treeContainer;
        this.currentFolder = null;
        this.contextMenu = contextMenuContainer;
        this.onFileSelect = null;

        // State
        this.expandedFolders = new Set();
        this.targetPath = null;
        this.targetIsDir = false;

        this.initContextMenu();
        this.initDragAndDrop();
    }

    async openFolder(folderPath) {
        if (!folderPath) return;
        this.currentFolder = folderPath;
        window.log('FileTree: Opening root folder:', folderPath);
        await this.renderTree(this.currentFolder, this.container, 0);
    }

    async refresh() {
        if (this.currentFolder) {
            await this.renderTree(this.currentFolder, this.container, 0);
        }
    }

    async renderTree(dirPath, parentElement, level) {
        // We only clear the root or a specific folder container
        parentElement.innerHTML = '';

        const items = await this.api.readDir(dirPath);
        if (!items) return;

        for (const item of items) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tree-item-wrapper';

            const div = document.createElement('div');
            div.className = 'tree-item';
            div.style.paddingLeft = `${10 + (level * 15)}px`;
            div.dataset.path = item.path;
            div.dataset.isDir = item.isDirectory;
            div.draggable = true;

            const icon = item.isDirectory ? (this.expandedFolders.has(item.path) ? '📂 ' : '📁 ') : '📄 ';
            div.innerHTML = `<span class="icon">${icon}</span><span class="name">${item.name}</span>`;

            div.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (item.isDirectory) {
                    this.toggleFolder(item.path, wrapper, level);
                } else {
                    if (this.onFileSelect) this.onFileSelect(item.path);
                    this.container.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
                    div.classList.add('active');
                }
            });

            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.targetPath = item.path;
                this.targetIsDir = item.isDirectory;
                this.showContextMenu(e.pageX, e.pageY);
            });

            // Drag events
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.path);
                div.style.opacity = '0.5';
            });
            div.addEventListener('dragend', () => { div.style.opacity = '1'; });

            wrapper.appendChild(div);

            // Auto-expand if in state
            if (item.isDirectory && this.expandedFolders.has(item.path)) {
                const childContainer = document.createElement('div');
                childContainer.className = 'child-container';
                wrapper.appendChild(childContainer);
                await this.renderTree(item.path, childContainer, level + 1);
            }

            parentElement.appendChild(wrapper);
        }
    }

    async toggleFolder(path, wrapper, level) {
        const iconSpan = wrapper.querySelector('.icon');
        const existingContainer = wrapper.querySelector('.child-container');

        if (this.expandedFolders.has(path)) {
            this.expandedFolders.delete(path);
            if (existingContainer) existingContainer.remove();
            if (iconSpan) iconSpan.textContent = '📁 ';
        } else {
            this.expandedFolders.add(path);
            if (iconSpan) iconSpan.textContent = '📂 ';
            const childContainer = document.createElement('div');
            childContainer.className = 'child-container';
            wrapper.appendChild(childContainer);
            await this.renderTree(path, childContainer, level + 1);
        }
    }

    initContextMenu() {
        if (!this.contextMenu) return;
        document.addEventListener('click', () => { this.contextMenu.style.display = 'none'; });

        this.contextMenu.innerHTML = `
            <div id="ctx-new-file">New File</div>
            <div id="ctx-new-folder">New Folder</div>
            <div id="ctx-rename">Rename</div>
            <div id="ctx-delete" style="color:#ff4444">Delete</div>
        `;

        this.contextMenu.querySelector('#ctx-new-file').addEventListener('click', async () => {
            const name = prompt('File name:');
            if (name) {
                const dir = this.targetIsDir ? this.targetPath : this.getPathDir(this.targetPath);
                const success = await this.api.createFile(`${dir}/${name}${name.includes('.') ? '' : '.md'}`);
                if (success) this.refresh();
                else alert('Failed to create file');
            }
        });

        this.contextMenu.querySelector('#ctx-new-folder').addEventListener('click', async () => {
            const name = prompt('Folder name:');
            if (name) {
                const dir = this.targetIsDir ? this.targetPath : this.getPathDir(this.targetPath);
                const success = await this.api.createFolder(`${dir}/${name}`);
                if (success) this.refresh();
                else alert('Failed to create folder');
            }
        });

        this.contextMenu.querySelector('#ctx-rename').addEventListener('click', async () => {
            const oldName = this.targetPath.split(/[/\\]/).pop();
            const newName = prompt('New name:', oldName);
            if (newName && newName !== oldName) {
                const dir = this.getPathDir(this.targetPath);
                const success = await this.api.renameItem(this.targetPath, `${dir}/${newName}`);
                if (success) this.refresh();
                else alert('Failed to rename item');
            }
        });

        this.contextMenu.querySelector('#ctx-delete').addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete ${this.targetPath}?`)) {
                const success = await this.api.deleteItem(this.targetPath);
                if (success) this.refresh();
                else alert('Failed to delete item');
            }
        });
    }

    initDragAndDrop() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.tree-item');
            if (target && target.dataset.isDir === 'true') {
                target.classList.add('drag-over');
            }
        });

        this.container.addEventListener('dragleave', (e) => {
            const target = e.target.closest('.tree-item');
            if (target) target.classList.remove('drag-over');
        });

        this.container.addEventListener('drop', async (e) => {
            e.preventDefault();
            const sourcePath = e.dataTransfer.getData('text/plain');
            const targetItem = e.target.closest('.tree-item');

            if (targetItem) targetItem.classList.remove('drag-over');

            if (targetItem && targetItem.dataset.isDir === 'true') {
                const targetDir = targetItem.dataset.path;
                if (sourcePath === targetDir) return;

                const fileName = sourcePath.split(/[/\\]/).pop();
                const newPath = `${targetDir}/${fileName}`;

                window.log(`FileTree: Moving ${sourcePath} -> ${newPath}`);
                const res = await this.api.renameItem(sourcePath, newPath);
                if (res) this.refresh();
                else alert('Failed to move item');
            }
        });
    }

    getPathDir(p) {
        return p.substring(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
    }

    showContextMenu(x, y) {
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
    }
}
