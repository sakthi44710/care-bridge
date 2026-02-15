import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class DocumentDetailScreen extends StatefulWidget {
  final String documentId;

  const DocumentDetailScreen({super.key, required this.documentId});

  @override
  State<DocumentDetailScreen> createState() => _DocumentDetailScreenState();
}

class _DocumentDetailScreenState extends State<DocumentDetailScreen> {
  final ApiService _api = ApiService();
  Document? _document;
  Map<String, dynamic>? _verification;
  String? _downloadUrl;
  bool _loading = true;
  bool _verifying = false;
  bool _extracting = false;

  @override
  void initState() {
    super.initState();
    _loadDocument();
  }

  Future<void> _loadDocument() async {
    try {
      final doc = await _api.getDocument(widget.documentId);
      String? url;
      try {
        url = await _api.getDocumentUrl(widget.documentId);
      } catch (_) {}
      setState(() {
        _document = doc;
        _downloadUrl = url;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _openDownload() async {
    if (_downloadUrl == null) return;
    final uri = Uri.parse(_downloadUrl!);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _verify() async {
    setState(() => _verifying = true);
    try {
      final result = await _api.verifyDocument(widget.documentId);
      setState(() => _verification = result);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Verification failed')),
        );
      }
    } finally {
      setState(() => _verifying = false);
    }
  }

  Future<void> _anchor() async {
    try {
      await _api.anchorDocument(widget.documentId);
      _loadDocument();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Document anchored to blockchain'),
            backgroundColor: AppTheme.successColor,
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _extract() async {
    setState(() => _extracting = true);
    try {
      await _api.extractHealthRecords(widget.documentId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Health records extracted successfully!'),
            backgroundColor: AppTheme.successColor,
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Extraction failed')),
        );
      }
    } finally {
      setState(() => _extracting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_document?.filename ?? 'Document'),
        actions: [
          if (_document != null)
            IconButton(
              icon: const Icon(Icons.shield_outlined),
              onPressed: _verifying ? null : _verify,
              tooltip: 'Verify Integrity',
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _document == null
              ? const Center(child: Text('Document not found'))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Document Info Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.description,
                                      color: AppTheme.primaryColor),
                                  SizedBox(width: 8),
                                  Text('Document Information',
                                      style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600)),
                                ],
                              ),
                              const Divider(height: 24),
                              _InfoRow('Filename', _document!.filename),
                              _InfoRow('Type',
                                  _document!.documentType.replaceAll('_', ' ')),
                              _InfoRow(
                                  'MIME Type', _document!.mimeType ?? 'N/A'),
                              _InfoRow('Size',
                                  formatFileSize(_document!.fileSize ?? 0)),
                              _InfoRow('Status', _document!.status),
                              if (_document!.ocrConfidence != null)
                                _InfoRow(
                                  'OCR Confidence',
                                  '${(_document!.ocrConfidence! * 100).toStringAsFixed(1)}%',
                                ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Document Preview / Download
                      if (_downloadUrl != null)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Row(
                                  children: [
                                    Icon(Icons.preview,
                                        color: AppTheme.primaryColor),
                                    SizedBox(width: 8),
                                    Text('Document Preview',
                                        style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w600)),
                                  ],
                                ),
                                const Divider(height: 24),
                                if (_document!.mimeType != null &&
                                    _document!.mimeType!.startsWith('image/'))
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      _downloadUrl!,
                                      fit: BoxFit.contain,
                                      width: double.infinity,
                                      height: 300,
                                      loadingBuilder: (ctx, child, progress) {
                                        if (progress == null) return child;
                                        return const SizedBox(
                                          height: 200,
                                          child: Center(
                                              child:
                                                  CircularProgressIndicator()),
                                        );
                                      },
                                      errorBuilder: (ctx, err, st) =>
                                          const SizedBox(
                                        height: 100,
                                        child: Center(
                                            child:
                                                Text('Failed to load preview')),
                                      ),
                                    ),
                                  )
                                else
                                  Center(
                                    child: Text(
                                      'Preview not available for this file type.\nUse the download button to view.',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.grey.shade600),
                                    ),
                                  ),
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: _openDownload,
                                    icon: const Icon(Icons.download, size: 18),
                                    label: const Text('Download Document'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),

                      const SizedBox(height: 16),

                      // Blockchain Card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.shield,
                                      color: AppTheme.primaryColor),
                                  SizedBox(width: 8),
                                  Text('Blockchain Integrity',
                                      style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600)),
                                ],
                              ),
                              const Divider(height: 24),
                              if (_document!.contentHash != null)
                                _InfoRow(
                                    'Content Hash', _document!.contentHash!,
                                    mono: true),
                              if (_document!.blockchainTxHash != null) ...[
                                _InfoRow(
                                    'TX Hash', _document!.blockchainTxHash!,
                                    mono: true),
                              ] else
                                Center(
                                  child: Column(
                                    children: [
                                      Text('Not anchored yet',
                                          style: TextStyle(
                                              color: Colors.grey.shade600)),
                                      const SizedBox(height: 8),
                                      OutlinedButton.icon(
                                        onPressed: _anchor,
                                        icon: const Icon(Icons.link),
                                        label:
                                            const Text('Anchor to Blockchain'),
                                      ),
                                    ],
                                  ),
                                ),
                              // Verification result
                              if (_verification != null) ...[
                                const SizedBox(height: 12),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: _verification!['is_valid'] == true
                                        ? Colors.green.shade50
                                        : Colors.red.shade50,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    children: [
                                      Icon(
                                        _verification!['is_valid'] == true
                                            ? Icons.check_circle
                                            : Icons.error,
                                        color:
                                            _verification!['is_valid'] == true
                                                ? AppTheme.successColor
                                                : AppTheme.errorColor,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        _verification!['is_valid'] == true
                                            ? 'Integrity Verified'
                                            : 'Integrity Check Failed',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // Extract Health Records
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.monitor_heart,
                                      color: AppTheme.primaryColor),
                                  SizedBox(width: 8),
                                  Text('Health Data Extraction',
                                      style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600)),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Extract structured health records from this document using AI.',
                                style: TextStyle(
                                    color: Colors.grey.shade600, fontSize: 13),
                              ),
                              const SizedBox(height: 12),
                              ElevatedButton.icon(
                                onPressed: _extracting ? null : _extract,
                                icon: _extracting
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white),
                                      )
                                    : const Icon(Icons.science),
                                label: Text(_extracting
                                    ? 'Extracting...'
                                    : 'Extract Health Records'),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const MedicalDisclaimer(),
                    ],
                  ),
                ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;

  const _InfoRow(this.label, this.value, {this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                fontFamily: mono ? 'monospace' : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
