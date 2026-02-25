export class InlineAssistant {
    constructor(api, aiService, promptBuilder, contextManager, editorService) {
        this.api = api;
        this.aiService = aiService;
        this.promptBuilder = promptBuilder;
        this.contextManager = contextManager;
        this.editorService = editorService;

        this.currentSelection = { start: 0, end: 0 };
        this.createUI();
    }

    createUI() {
        this.popup = document.createElement('div');
        this.popup.className = 'ai-inline-popup';
        this.popup.style.display = 'none';
        this.popup.innerHTML = `
            <div class="ai-inline-actions">
                <button data-action="improve_style">✨ Improve</button>
                <button data-action="rewrite">🔄 Rewrite</button>
                <button data-action="summarize">📝 Summarize</button>
                <button data-action="explain_code">💡 Explain</button>
            </div>
            <div class="ai-inline-result" style="display:none">
                <div class="ai-inline-content markdown-body"></div>
                <div class="ai-inline-footer">
                    <button id="ai-btn-replace">Replace</button>
                    <button id="ai-btn-insert">Insert Below</button>
                    <button id="ai-btn-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.popup);

        this.editorElem = document.getElementById('editor');
        this.editorElem.addEventListener('mouseup', () => this.checkSelection());
        this.editorElem.addEventListener('keyup', () => this.checkSelection());

        this.popup.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => this.runAction(e.target.dataset.action));
        });

        this.popup.querySelector('#ai-btn-replace').addEventListener('click', () => this.applyResult('replace'));
        this.popup.querySelector('#ai-btn-insert').addEventListener('click', () => this.applyResult('insert'));
        this.popup.querySelector('#ai-btn-cancel').addEventListener('click', () => this.close());
    }

    checkSelection() {
        if (this.editorElem.selectionStart !== this.editorElem.selectionEnd) {
            // Only update selection if not already showing result for a previous one
            if (!this.popup.classList.contains('showing-result')) {
                this.popup.style.display = 'block';
                this.popup.querySelector('.ai-inline-actions').style.display = 'flex';
                this.popup.querySelector('.ai-inline-result').style.display = 'none';

                // Position popup near the bottom right of the screen or near selection?
                // For now, keep fixed but ensure it's visible. 
            }
        } else {
            if (!this.popup.classList.contains('showing-result')) {
                this.popup.style.display = 'none';
            }
        }
    }

    async runAction(templateName) {
        // Capture specific selection boundaries now
        this.currentSelection.start = this.editorElem.selectionStart;
        this.currentSelection.end = this.editorElem.selectionEnd;

        const context = this.contextManager.getContext();
        if (!context.selection) {
            window.log('InlineAssistant: No selection found in context');
            return;
        }

        window.log(`InlineAssistant: Running action ${templateName}`);
        const prompt = this.promptBuilder.build(templateName, context);

        this.popup.classList.add('showing-result');
        this.popup.querySelector('.ai-inline-actions').style.display = 'none';
        this.popup.querySelector('.ai-inline-result').style.display = 'block';
        const contentDiv = this.popup.querySelector('.ai-inline-content');

        contentDiv.innerHTML = '<i>AI is thinking...</i>';
        this.currentResult = '';

        this.abortFn = await this.aiService.generate(prompt,
            (chunk) => {
                if (this.currentResult === '') contentDiv.innerHTML = '';
                this.currentResult += chunk;
                contentDiv.innerHTML = window.api.renderMarkdown(this.currentResult);
                contentDiv.scrollTop = contentDiv.scrollHeight;
            },
            () => {
                this.abortFn = null;
                window.log('InlineAssistant: Stream finished');
            },
            (err) => {
                window.log('InlineAssistant: Stream error:', err);
                contentDiv.innerHTML = `<span style="color:red">Error: ${err}</span>`;
            }
        );
    }

    applyResult(mode) {
        if (!this.currentResult) return;

        const start = this.currentSelection.start;
        const end = this.currentSelection.end;
        const text = this.editorElem.value;

        window.log(`InlineAssistant: Applying result (${mode}) to range ${start}-${end}`);

        if (mode === 'replace') {
            this.editorElem.value = text.substring(0, start) + this.currentResult + text.substring(end);
            this.editorElem.selectionStart = start;
            this.editorElem.selectionEnd = start + this.currentResult.length;
        } else {
            // Insert below the selection
            this.editorElem.value = text.substring(0, end) + '\n\n' + this.currentResult + text.substring(end);
            this.editorElem.selectionStart = end + 2;
            this.editorElem.selectionEnd = end + 2 + this.currentResult.length;
        }

        // Trigger save and preview update
        this.editorElem.dispatchEvent(new Event('input'));
        this.close();
        this.editorElem.focus();
    }

    close() {
        if (this.abortFn) {
            this.abortFn();
            this.abortFn = null;
        }
        this.popup.style.display = 'none';
        this.popup.classList.remove('showing-result');
        this.currentResult = '';
    }
}
