export class FileService {
    constructor(api, updateStatus) {
        this.api = api;
        this.updateStatus = updateStatus;
        this.currentFilePath = null;
        this.isSaving = false;
        this.saveTimeout = null;
    }

    async openFile() {
        window.log('FileService: Opening file dialog...');
        const result = await this.api.openFileDialog();
        if (result) {
            window.log('FileService: File opened:', result.path);
            this.currentFilePath = result.path;
            return result;
        }
        return null;
    }

    async openRecentFile(filePath) {
        window.log('FileService: Reading file:', filePath);
        const result = await this.api.readFile(filePath);
        if (result) {
            this.currentFilePath = result.path;
            return result;
        }
        return null;
    }

    async saveFile(content) {
        if (this.isSaving) {
            window.log('FileService: Save already in progress, skipping');
            return false;
        }

        this.isSaving = true;
        this.updateStatus('Saving...');
        window.log('FileService: Saving file...', this.currentFilePath || 'New File');

        try {
            const result = await this.api.saveFileDialog({
                filePath: this.currentFilePath,
                content: content
            });

            if (result) {
                this.currentFilePath = result;
                this.updateStatus('Saved');
                window.log('FileService: Saved successfully to:', result);
                return result;
            } else {
                this.updateStatus('');
                window.log('FileService: Save cancelled');
                return null;
            }
        } catch (e) {
            window.log('FileService: Save failed:', e);
            this.updateStatus('Error saving');
            return null;
        } finally {
            this.isSaving = false;
        }
    }

    scheduleAutoSave(content, config) {
        if (!config.autoSave || !this.currentFilePath) return;

        if (this.saveTimeout) clearTimeout(this.saveTimeout);

        this.updateStatus('Typing...');

        this.saveTimeout = setTimeout(async () => {
            if (this.isSaving) return;
            this.isSaving = true;
            this.updateStatus('Auto-saving...');

            window.log('FileService: Auto-saving:', this.currentFilePath);
            try {
                const success = await this.api.saveFileAuto({
                    filePath: this.currentFilePath,
                    content: content,
                    makeBackup: config.autoSaveBackups
                });

                if (success) {
                    this.updateStatus('Auto-saved');
                    window.log('FileService: Auto-save successful');
                } else {
                    this.updateStatus('Save failed');
                    window.log('FileService: Auto-save failed');
                }
            } catch (e) {
                window.log('FileService: Auto-save error:', e);
                this.updateStatus('Error');
            } finally {
                this.isSaving = false;
            }
        }, config.autoSaveDelay || 7000);
    }
}
