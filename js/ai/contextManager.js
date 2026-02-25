export class ContextManager {
    constructor(editorElem, tabService, modelManager) {
        this.editorElem = editorElem;
        this.tabService = tabService;
        this.modelManager = modelManager;
    }

    getContext() {
        const config = this.modelManager.getConfig();
        const activeTab = this.tabService.getActiveTab();
        const fullText = this.editorElem.value;
        const selectionStart = this.editorElem.selectionStart;
        const selectionEnd = this.editorElem.selectionEnd;
        const selection = fullText.substring(selectionStart, selectionEnd);

        let contextText = selection;
        const tokenLimit = config.maxTokens || 2000;

        if (!selection && config.allowFullDocumentContext) {
            contextText = fullText.slice(0, tokenLimit * 4);
        } else if (!selection) {
            contextText = "";
        }

        return {
            title: activeTab ? activeTab.title : 'Untitled',
            selection: selection,
            fullText: config.allowFullDocumentContext ? fullText : '',
            contextText: contextText
        };
    }
}
