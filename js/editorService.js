export class EditorService {
    constructor(editorElem, previewElem, statsElem, api) {
        this.editor = editorElem;
        this.preview = previewElem;
        this.stats = statsElem;
        this.api = api;
    }

    updatePreview() {
        const text = this.editor.value;
        const renderedHtml = this.api.renderMarkdown(text);
        this.preview.innerHTML = renderedHtml;
        this.updateStats();
    }

    updateStats() {
        const text = this.editor.value;
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        this.stats.textContent = `${words} words | ${chars} chars`;
    }

    // V4 Fix: Use execCommand to preserve undo/redo history in simple textareas
    wrapSelection(before, after) {
        this.editor.focus();
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const selectedText = this.editor.value.substring(start, end);
        const replacement = before + selectedText + after;

        // execCommand is deprecated but still the only way to support Undo in native textarea in Electron
        // without a full custom Undo stack.
        if (!document.execCommand('insertText', false, replacement)) {
            // Fallback if execCommand fails
            this.editor.value = this.editor.value.substring(0, start) + replacement + this.editor.value.substring(end);
        }

        // Restore selection
        this.editor.selectionStart = start + before.length;
        this.editor.selectionEnd = start + before.length + selectedText.length;

        this.updatePreview();
    }

    insertText(textToInsert) {
        this.editor.focus();
        document.execCommand('insertText', false, textToInsert);
        this.updatePreview();
    }

    focusSearch(searchInput) {
        searchInput.focus();
        searchInput.select();
    }
}
