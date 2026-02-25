export class AiService {
    constructor(api, modelManager) {
        this.api = api;
        this.modelManager = modelManager;
        this.buffers = new Map(); // id -> string buffer for fragmented JSON
    }

    async generate(prompt, onChunk, onDone, onError) {
        const config = this.modelManager.getConfig();
        const id = Date.now().toString() + Math.random().toString().slice(2, 6);
        this.buffers.set(id, '');

        window.log(`AiService: Generating with prompt (Prompt snippet: ${prompt.slice(0, 50)}...)`);

        let payload = {};
        let endpoint = '';

        if (config.provider === 'ollama') {
            endpoint = `${config.endpoint}/api/generate`;
            payload = {
                model: config.model,
                prompt: prompt,
                stream: true,
                system: config.systemPrompt,
                options: {
                    temperature: config.temperature,
                    num_predict: config.maxTokens
                }
            };
        } else {
            // OpenAI / LM Studio / OpenRouter
            endpoint = `${config.endpoint}/v1/chat/completions`;
            payload = {
                model: config.model,
                messages: [
                    { role: 'system', content: config.systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: config.temperature,
                max_tokens: config.maxTokens,
                stream: true
            };
        }

        const lChunk = this.api.onAiStreamChunk(id, (chunkData) => {
            const text = this.processStreamChunk(id, chunkData.chunk, config.provider, 'generate');
            if (text) onChunk(text);
        });

        const lDone = this.api.onAiStreamDone(id, () => {
            window.log(`AiService: Generation done [${id}]`);
            this.cleanup(id, lChunk, lDone, lErr);
            onDone();
        });

        const lErr = this.api.onAiStreamError(id, (err) => {
            window.log(`AiService: Generation error [${id}]:`, err);
            this.cleanup(id, lChunk, lDone, lErr);
            onError(err);
        });

        this.api.startAiStream({ id, endpoint, payload, provider: config.provider });
        return () => {
            window.log(`AiService: Generation aborted by user [${id}]`);
            this.api.stopAiStream(id);
        };
    }

    async chat(messages, onChunk, onDone, onError) {
        const config = this.modelManager.getConfig();
        const id = Date.now().toString() + Math.random().toString().slice(2, 6);
        this.buffers.set(id, '');

        window.log(`AiService: Chat started [${id}]`);

        let payload = {};
        let endpoint = '';

        if (config.provider === 'ollama') {
            endpoint = `${config.endpoint}/api/chat`;
            payload = {
                model: config.model,
                messages: [{ role: 'system', content: config.systemPrompt }, ...messages],
                stream: true,
                options: { temperature: config.temperature }
            };
        } else {
            // OpenAI / LM Studio / OpenRouter
            endpoint = `${config.endpoint}/v1/chat/completions`;
            payload = {
                model: config.model,
                messages: [{ role: 'system', content: config.systemPrompt }, ...messages],
                stream: true,
                temperature: config.temperature
            };
        }

        const lChunk = this.api.onAiStreamChunk(id, (chunkData) => {
            const text = this.processStreamChunk(id, chunkData.chunk, config.provider, 'chat');
            if (text) onChunk(text);
        });

        const lDone = this.api.onAiStreamDone(id, () => {
            this.cleanup(id, lChunk, lDone, lErr);
            onDone();
        });

        const lErr = this.api.onAiStreamError(id, (err) => {
            this.cleanup(id, lChunk, lDone, lErr);
            onError(err);
        });

        this.api.startAiStream({ id, endpoint, payload, provider: config.provider });
        return () => this.api.stopAiStream(id);
    }

    processStreamChunk(id, rawChunk, provider, type) {
        let buffer = this.buffers.get(id) + rawChunk;
        let resultText = '';

        const lines = buffer.split('\n');
        // Keep the last line in the buffer in case it's incomplete
        const lastLine = lines.pop();
        this.buffers.set(id, lastLine);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
                if (provider === 'ollama') {
                    const data = JSON.parse(trimmed);
                    if (type === 'generate') resultText += data.response || '';
                    else resultText += data.message?.content || '';
                } else {
                    if (trimmed.startsWith('data: ')) {
                        const content = trimmed.slice(6);
                        if (content === '[DONE]') continue;
                        const data = JSON.parse(content);
                        resultText += data.choices[0]?.delta?.content || data.choices[0]?.text || '';
                    }
                }
            } catch (e) {
                // Fragmented JSON line, push back to buffer
                this.buffers.set(id, line + '\n' + lastLine);
                break;
            }
        }
        return resultText;
    }

    cleanup(id, l1, l2, l3) {
        this.buffers.delete(id);
        this.api.removeListener(l1);
        this.api.removeListener(l2);
        this.api.removeListener(l3);
    }
}
