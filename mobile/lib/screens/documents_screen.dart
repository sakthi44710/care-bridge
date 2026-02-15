import 'package:flutter/material.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  final ApiService _api = ApiService();
  List<Document> _documents = [];
  bool _loading = true;
  String? _selectedType;
  String _search = '';

  final _types = [
    'All',
    'lab_result',
    'prescription',
    'radiology',
    'clinical_note',
    'insurance',
    'other',
  ];

  @override
  void initState() {
    super.initState();
    _loadDocuments();
  }

  Future<void> _loadDocuments() async {
    setState(() => _loading = true);
    try {
      final docs = await _api.getDocuments(
        type: _selectedType == 'All' ? null : _selectedType,
      );
      setState(() {
        _documents = docs;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _deleteDocument(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Document'),
        content: const Text('Are you sure you want to delete this document?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppTheme.errorColor)),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await _api.deleteDocument(id);
        _loadDocuments();
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _documents.where((d) =>
        _search.isEmpty ||
        d.filename.toLowerCase().contains(_search.toLowerCase()));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Documents'),
        actions: [
          IconButton(
            icon: const Icon(Icons.upload_file),
            onPressed: () async {
              await Navigator.pushNamed(context, '/documents/upload');
              _loadDocuments();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search documents...',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          // Type filter
          SizedBox(
            height: 48,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              itemCount: _types.length,
              itemBuilder: (context, i) {
                final type = _types[i];
                final selected = (_selectedType ?? 'All') == type;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(type.replaceAll('_', ' '),
                        style: const TextStyle(fontSize: 12)),
                    selected: selected,
                    onSelected: (_) {
                      setState(
                          () => _selectedType = type == 'All' ? null : type);
                      _loadDocuments();
                    },
                  ),
                );
              },
            ),
          ),
          // Documents list
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? EmptyState(
                        icon: Icons.description_outlined,
                        title: 'No documents found',
                        action: ElevatedButton.icon(
                          onPressed: () =>
                              Navigator.pushNamed(context, '/documents/upload'),
                          icon: const Icon(Icons.upload_file),
                          label: const Text('Upload Document'),
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadDocuments,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: filtered.length,
                          itemBuilder: (context, i) {
                            final doc = filtered.elementAt(i);
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                leading: const Icon(Icons.description,
                                    color: AppTheme.primaryColor),
                                title: Text(doc.filename,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                                subtitle: Text(
                                  '${doc.documentType.replaceAll('_', ' ')} • ${formatFileSize(doc.fileSize ?? 0)}',
                                  style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey.shade600),
                                ),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    if (doc.blockchainTxHash != null)
                                      const Icon(Icons.verified,
                                          color: AppTheme.successColor,
                                          size: 18),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline,
                                          size: 20, color: AppTheme.errorColor),
                                      onPressed: () => _deleteDocument(doc.id),
                                    ),
                                  ],
                                ),
                                onTap: () => Navigator.pushNamed(
                                  context,
                                  '/documents/detail',
                                  arguments: doc.id,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
