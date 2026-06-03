// Font Zoom (V4)
// Controls the editor/preview text size and persists it as `fontSize` (px) in config.
export class ZoomService {
    constructor(settingsService) {
        this.settings = settingsService;
        this.editor = document.getElementById('editor');
        this.preview = document.getElementById('preview');
        this.min = 8;
        this.max = 40;
        this.default = 14;
        this.size = this.default;
    }

    init(config) {
        this.size = (config && config.fontSize) || this.default;
        this.apply();
        window.log('ZoomService: initialized at', this.size, 'px');
    }

    apply() {
        if (this.editor) this.editor.style.fontSize = `${this.size}px`;
        if (this.preview) this.preview.style.fontSize = `${this.size}px`;
    }

    change(delta) {
        this.size = Math.min(this.max, Math.max(this.min, this.size + delta));
        this.apply();
        this.persist();
    }

    reset() {
        this.size = this.default;
        this.apply();
        this.persist();
    }

    persist() {
        this.settings.update({ fontSize: this.size });
    }
}
