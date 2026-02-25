export class PromptBuilder {
    constructor(api) {
        this.api = api;
        this.templates = {};
    }

    async init() {
        // Load dynamically from the UserData prompts directory
        const list = await this.api.getPrompts();
        for (const item of list) {
            this.templates[item.name] = item.content;
        }
    }

    getAvailableTemplates() {
        return Object.keys(this.templates).sort();
    }

    build(templateName, context) {
        let tpl = this.templates[templateName];
        if (!tpl) {
            tpl = `Please process the following text:\n\n{{text}}`;
        }

        return tpl
            .replace(/\{\{text\}\}/g, context.contextText)
            .replace(/\{\{title\}\}/g, context.title)
            .replace(/\{\{fullText\}\}/g, context.fullText);
    }
}
