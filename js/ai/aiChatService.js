export class AiChatService {
    constructor(aiService, container, toggleBtn) {
        this.aiService = aiService;
        this.container = container;
        this.toggleBtn = toggleBtn;
        this.messages = [];
        this.isOpen = false;
        this.isThinking = false;

        this.initUI();
    }

    initUI() {
        this.toggleBtn.addEventListener('click', () => this.toggle());

        this.container.innerHTML = `
            <div class="ai-chat-header">
                <h3>V4 AI Assistant</h3>
                <button id="ai-chat-close" title="Close Chart">×</button>
            </div>
            <div class="ai-chat-messages" id="ai-messages"></div>
            <div class="ai-chat-input-area">
                <textarea id="ai-input" placeholder="Type a message... (Shift+Enter for newline)"></textarea>
                <div class="ai-chat-controls">
                    <button id="ai-send-btn">Send</button>
                    <button id="ai-stop-btn" style="display:none; background:#aa0000">Stop</button>
                </div>
            </div>
        `;

        this.messagesDiv = this.container.querySelector('#ai-messages');
        this.inputElem = this.container.querySelector('#ai-input');
        this.sendBtn = this.container.querySelector('#ai-send-btn');
        this.stopBtn = this.container.querySelector('#ai-stop-btn');

        this.container.querySelector('#ai-chat-close').addEventListener('click', () => this.toggle(false));
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        this.stopBtn.addEventListener('click', () => {
            if (this.abortFn) {
                this.abortFn();
                this.isThinking = false;
                this.updateUIState();
            }
        });

        this.inputElem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    toggle(force) {
        this.isOpen = force !== undefined ? force : !this.isOpen;
        window.log('AiChatService: Toggle open:', this.isOpen);
        if (this.isOpen) {
            this.container.classList.add('open');
            document.querySelector('.main-content').style.marginRight = '300px';
            this.inputElem.focus();
        } else {
            this.container.classList.remove('open');
            document.querySelector('.main-content').style.marginRight = '0';
        }
    }

    async sendMessage() {
        const text = this.inputElem.value.trim();
        if (!text || this.isThinking) return;

        this.isThinking = true;
        this.updateUIState();

        this.messages.push({ role: 'user', content: text });
        this.appendMessage('user', text);
        this.inputElem.value = '';

        const aiMsgDiv = this.appendMessage('assistant', '<i>Thinking...</i>');
        let currentText = '';

        this.abortFn = await this.aiService.chat(this.messages,
            (chunk) => {
                if (currentText === '') aiMsgDiv.innerHTML = '';
                currentText += chunk;
                aiMsgDiv.innerHTML = window.api.renderMarkdown(currentText);
                this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
            },
            () => {
                this.messages.push({ role: 'assistant', content: currentText });
                this.abortFn = null;
                this.isThinking = false;
                this.updateUIState();
                window.log('AiChatService: Message complete');
            },
            (err) => {
                window.log('AiChatService: Message error:', err);
                aiMsgDiv.innerHTML = `<span style="color:red">Error: ${err}</span>`;
                this.isThinking = false;
                this.updateUIState();
            }
        );
    }

    updateUIState() {
        if (this.isThinking) {
            this.sendBtn.style.display = 'none';
            this.stopBtn.style.display = 'block';
            this.inputElem.disabled = true;
        } else {
            this.sendBtn.style.display = 'block';
            this.stopBtn.style.display = 'none';
            this.inputElem.disabled = false;
            this.inputElem.focus();
        }
    }

    appendMessage(role, text) {
        const div = document.createElement('div');
        div.className = `ai-message ${role}`;
        div.innerHTML = role === 'user' ? text : window.api.renderMarkdown(text);
        this.messagesDiv.appendChild(div);
        this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
        return div;
    }
}
