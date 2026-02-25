export class ModelManager {
    constructor(api, config) {
        this.api = api;
        this.config = config.aiConfig || this.getDefaults();
    }

    getDefaults() {
        return {
            provider: 'ollama',
            endpoint: 'http://localhost:11434',
            model: 'mistral',
            temperature: 0.7,
            maxTokens: 2048,
            systemPrompt: 'You are a helpful Markdown writing assistant.',
            allowFullDocumentContext: false
        };
    }

    getConfig() {
        return this.config;
    }

    async updateConfig(newConfig, fullAppSave = null) {
        this.config = { ...this.config, ...newConfig };
        if (fullAppSave) {
            await fullAppSave({ aiConfig: this.config });
        } else {
            await this.api.saveConfig({ aiConfig: this.config });
        }
    }

    async checkConnection() {
        try {
            if (this.config.provider === 'ollama') {
                const res = await this.api.aiFetch({ endpoint: `${this.config.endpoint}/api/tags` });
                return res.ok;
            } else {
                const res = await this.api.aiFetch({ endpoint: `${this.config.endpoint}/v1/models` });
                return res.ok;
            }
        } catch (e) { return false; }
    }

    async getModels() {
        try {
            if (this.config.provider === 'ollama') {
                const res = await this.api.aiFetch({ endpoint: `${this.config.endpoint}/api/tags` });
                if (!res.ok) return [];
                return res.data.models.map(m => m.name);
            } else {
                const res = await this.api.aiFetch({ endpoint: `${this.config.endpoint}/v1/models` });
                if (!res.ok) return [];
                return res.data.data.map(m => m.id);
            }
        } catch (e) { return []; }
    }
}
