import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/config/theme.dart';

class DocumentUploadScreen extends StatefulWidget {
  const DocumentUploadScreen({super.key});

  @override
  State<DocumentUploadScreen> createState() => _DocumentUploadScreenState();
}

class _DocumentUploadScreenState extends State<DocumentUploadScreen> {
  final ApiService _api = ApiService();
  File? _selectedFile;
  String? _fileName;
  String _documentType = 'lab_result';
  bool _uploading = false;
  double _progress = 0;

  final _documentTypes = {
    'lab_result': 'Lab Result',
    'prescription': 'Prescription',
    'radiology': 'Radiology Report',
    'clinical_note': 'Clinical Note',
    'insurance': 'Insurance Document',
    'other': 'Other',
  };

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'bmp'],
    );
    if (result != null && result.files.single.path != null) {
      setState(() {
        _selectedFile = File(result.files.single.path!);
        _fileName = result.files.single.name;
      });
    }
  }

  Future<void> _uploadFile() async {
    if (_selectedFile == null) return;

    setState(() {
      _uploading = true;
      _progress = 0;
    });

    try {
      // Simulated progress
      for (int i = 1; i <= 3; i++) {
        await Future.delayed(const Duration(milliseconds: 300));
        if (mounted) setState(() => _progress = i / 4);
      }

      await _api.uploadDocument(_selectedFile!, _documentType);

      if (mounted) {
        setState(() => _progress = 1.0);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Document uploaded successfully!'),
            backgroundColor: AppTheme.successColor,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Upload failed. Please try again.'),
            backgroundColor: AppTheme.errorColor,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Upload Document')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // File picker area
            GestureDetector(
              onTap: _uploading ? null : _pickFile,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(40),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: _selectedFile != null
                        ? AppTheme.primaryColor
                        : Colors.grey.shade300,
                    width: 2,
                    style: BorderStyle.solid,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  color: _selectedFile != null
                      ? AppTheme.primaryColor.withAlpha(12)
                      : null,
                ),
                child: Column(
                  children: [
                    Icon(
                      _selectedFile != null
                          ? Icons.check_circle
                          : Icons.cloud_upload_outlined,
                      size: 48,
                      color: _selectedFile != null
                          ? AppTheme.primaryColor
                          : Colors.grey.shade400,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _selectedFile != null
                          ? _fileName ?? 'File selected'
                          : 'Tap to select a file',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: _selectedFile != null
                            ? AppTheme.primaryColor
                            : Colors.grey.shade600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'PDF, JPG, PNG, TIFF, BMP',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Document type selector
            const Text('Document Type',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _documentType,
              decoration: const InputDecoration(),
              items: _documentTypes.entries
                  .map((e) => DropdownMenuItem(
                        value: e.key,
                        child: Text(e.value),
                      ))
                  .toList(),
              onChanged:
                  _uploading ? null : (v) => setState(() => _documentType = v!),
            ),
            const SizedBox(height: 32),

            // Progress
            if (_uploading) ...[
              LinearProgressIndicator(value: _progress),
              const SizedBox(height: 8),
              Text(
                'Uploading... ${(_progress * 100).toInt()}%',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 24),
            ],

            // Upload button
            ElevatedButton.icon(
              onPressed:
                  _selectedFile != null && !_uploading ? _uploadFile : null,
              icon: _uploading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.upload),
              label: Text(_uploading ? 'Uploading...' : 'Upload Document'),
            ),

            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline,
                      size: 18, color: Colors.blue.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Your document will be encrypted with AES-256-GCM and processed with OCR.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.blue.shade700),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
