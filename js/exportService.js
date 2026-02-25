export class ExportService {
    constructor(api) {
        this.api = api;
    }

    async exportPdf() {
        window.log('ExportService: Triggering PDF export...');
        const res = await this.api.exportPdf();
        if (res) {
            window.log('ExportService: PDF saved to:', res);
        } else {
            window.log('ExportService: PDF export cancelled or failed.');
        }
    }

    async exportHtml(previewContainer) {
        window.log('ExportService: Triggering HTML export...');
        const htmlContent = previewContainer.innerHTML;
        const res = await this.api.exportHtml(htmlContent);
        if (res) {
            window.log('ExportService: HTML saved to:', res);
        }
    }
}
