export class ScrollSync {
    constructor(editorElem, previewElem) {
        this.editor = editorElem;
        this.preview = previewElem;
        this.isSyncingLeft = false;
        this.isSyncingRight = false;
        this.lastTop = 0;

        this.setupListeners();
    }

    setupListeners() {
        this.editor.addEventListener('scroll', () => {
            if (this.isSyncingLeft) {
                this.isSyncingLeft = false;
                return;
            }
            this.isSyncingRight = true;
            // Throttle with requestAnimationFrame
            if (this.syncTask) cancelAnimationFrame(this.syncTask);
            this.syncTask = requestAnimationFrame(() => this.syncPreviewToEditor());
        });

        this.preview.addEventListener('scroll', () => {
            if (this.isSyncingRight) {
                this.isSyncingRight = false;
                return;
            }
            this.isSyncingLeft = true;
            if (this.syncTask) cancelAnimationFrame(this.syncTask);
            this.syncTask = requestAnimationFrame(() => this.syncEditorToPreview());
        });
    }

    syncPreviewToEditor() {
        const editorScrollTop = this.editor.scrollTop;
        const editorScrollHeight = this.editor.scrollHeight - this.editor.clientHeight;

        if (editorScrollTop === 0) {
            this.preview.scrollTop = 0;
            return;
        }

        if (editorScrollTop >= editorScrollHeight - 5) {
            this.preview.scrollTop = this.preview.scrollHeight - this.preview.clientHeight;
            return;
        }

        const editorLine = this.getEditorCurrentLine();
        const elements = Array.from(this.preview.querySelectorAll('[data-line]'));

        let targetElement = null;
        for (let i = 0; i < elements.length; i++) {
            const elLine = parseInt(elements[i].getAttribute('data-line'), 10);
            if (elLine >= editorLine) {
                targetElement = elements[i];
                break;
            }
        }

        if (targetElement) {
            // Use smooth scrolling if possible? Better to be immediate for sync.
            this.preview.scrollTop = targetElement.offsetTop - 40;
        }
    }

    syncEditorToPreview() {
        const previewScrollTop = this.preview.scrollTop;
        if (previewScrollTop === 0) {
            this.editor.scrollTop = 0;
            return;
        }

        if (previewScrollTop + this.preview.clientHeight >= this.preview.scrollHeight - 5) {
            this.editor.scrollTop = this.editor.scrollHeight - this.editor.clientHeight;
            return;
        }

        const elements = Array.from(this.preview.querySelectorAll('[data-line]'));
        let targetElement = null;

        // Find element appearing at current scroll height
        for (let el of elements) {
            if (el.offsetTop - 50 > previewScrollTop) break;
            targetElement = el;
        }

        if (targetElement) {
            const line = parseInt(targetElement.getAttribute('data-line'), 10);
            const style = window.getComputedStyle(this.editor);
            const lineHeight = parseFloat(style.lineHeight) || 22;
            this.editor.scrollTop = line * lineHeight;
        }
    }

    getEditorCurrentLine() {
        const style = window.getComputedStyle(this.editor);
        const lineHeight = parseFloat(style.lineHeight) || 22;
        return Math.floor(this.editor.scrollTop / lineHeight);
    }
}
