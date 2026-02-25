export class SettingsService {
    constructor(api) {
        this.api = api;
        this.config = null;
    }

    async init() {
        this.config = await this.api.getConfig();
        window.log('SettingsService: Configuration initialized', this.config);
        return this.config;
    }

    async update(patch) {
        window.log('SettingsService: Updating configuration with patch:', patch);
        this.config = await this.api.saveConfig(patch);

        // Reactivity for debug mode
        if (patch.debugMode !== undefined) {
            window.debugEnabled = patch.debugMode;
            window.log('SettingsService: Debug Mode updated to:', window.debugEnabled);
        }

        return this.config;
    }

    applyTheme(theme) {
        const body = document.body;
        const hljsTheme = document.getElementById('hljs-theme');

        window.log('SettingsService: Applying theme:', theme);

        body.classList.remove('theme-dark', 'theme-light');
        body.classList.add(`theme-${theme}`);

        if (theme === 'dark') {
            hljsTheme.href = "node_modules/highlight.js/styles/github-dark.css";
        } else {
            hljsTheme.href = "node_modules/highlight.js/styles/github.css";
        }
    }
}
