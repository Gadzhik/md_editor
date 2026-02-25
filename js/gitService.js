export class GitService {
    constructor(api, updateStatus, updateBtn) {
        this.api = api;
        this.updateStatus = updateStatus;
        this.updateBtn = updateBtn;
        this.currentFolder = null;
        this.isRepo = false;
        this.commitInterval = null;
    }

    async init(folderPath, config) {
        if (!folderPath) return;
        this.currentFolder = folderPath;
        window.log('GitService: Checking repository at:', folderPath);

        try {
            // Check if Git is installed and folder is a repo
            const res = await this.api.gitCheck(folderPath);

            if (res === null) {
                window.log('GitService: Git might not be installed or accessible.');
                this.updateStatus('Git: Not installed');
                this.updateBtn(false);
                return;
            }

            this.isRepo = res;
            if (this.isRepo) {
                this.updateStatus('Git: Active');
                this.updateBtn(true);
                if (config.gitAutoCommit) {
                    this.startAutoCommit(config.gitCommitInterval || 60000);
                }
            } else {
                this.updateStatus('Git: No Repo');
                this.updateBtn(false);
            }
        } catch (e) {
            window.log('GitService Error during init:', e);
            this.updateStatus('Git: Error');
            this.updateBtn(false);
        }
    }

    startAutoCommit(intervalMs) {
        if (this.commitInterval) clearInterval(this.commitInterval);
        window.log('GitService: Auto-commit started with interval:', intervalMs);

        this.commitInterval = setInterval(async () => {
            if (!this.isRepo || !this.currentFolder) return;

            window.log('GitService: Triggering auto-commit...');
            const success = await this.api.gitCommit(this.currentFolder);

            if (success) {
                this.updateStatus('Git: Auto-commited');
                setTimeout(() => {
                    if (this.isRepo) this.updateStatus('Git: Active');
                }, 3000);
            }
        }, intervalMs);
    }

    async viewDiff() {
        if (!this.currentFolder) return;
        window.log('GitService: Opening diff view for:', this.currentFolder);
        await this.api.gitDiff(this.currentFolder);
    }

    stop() {
        if (this.commitInterval) clearInterval(this.commitInterval);
        this.currentFolder = null;
        this.isRepo = false;
        this.updateBtn(false);
        this.updateStatus('');
    }
}
