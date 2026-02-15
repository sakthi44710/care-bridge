import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class BlockchainScreen extends StatefulWidget {
  const BlockchainScreen({super.key});

  @override
  State<BlockchainScreen> createState() => _BlockchainScreenState();
}

class _BlockchainScreenState extends State<BlockchainScreen> {
  final ApiService _api = ApiService();
  List<BlockchainAudit> _audits = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadAudits();
  }

  Future<void> _loadAudits() async {
    try {
      final audits = await _api.getBlockchainAudits();
      setState(() {
        _audits = audits;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  IconData _eventIcon(String eventType) {
    switch (eventType.toLowerCase()) {
      case 'upload':
        return Icons.upload_file;
      case 'access':
        return Icons.visibility;
      case 'verify':
        return Icons.verified;
      case 'anchor':
        return Icons.anchor;
      case 'extract':
        return Icons.analytics;
      case 'delete':
        return Icons.delete;
      case 'share':
        return Icons.share;
      default:
        return Icons.receipt_long;
    }
  }

  Color _eventColor(String eventType) {
    switch (eventType.toLowerCase()) {
      case 'upload':
        return Colors.blue;
      case 'access':
        return Colors.green;
      case 'verify':
        return Colors.purple;
      case 'anchor':
        return Colors.orange;
      case 'extract':
        return Colors.teal;
      case 'delete':
        return Colors.red;
      case 'share':
        return Colors.indigo;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Blockchain Audit Trail'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadAudits,
              child: _audits.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 100),
                      EmptyState(
                        icon: Icons.link,
                        title: 'No audit records',
                        subtitle:
                            'Blockchain events will appear here when documents are anchored',
                      ),
                    ])
                  : _buildContent(),
            ),
    );
  }

  Widget _buildContent() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Info card
        Card(
          color: AppTheme.primaryColor.withAlpha(15),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(Icons.shield, color: AppTheme.primaryColor),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Immutable Audit Trail',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text(
                        '${_audits.length} events recorded on blockchain',
                        style: TextStyle(
                            fontSize: 13, color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        // Timeline
        ..._audits.asMap().entries.map((e) {
          final i = e.key;
          final audit = e.value;
          final isLast = i == _audits.length - 1;
          return _buildTimelineItem(audit, isLast);
        }),
      ],
    );
  }

  Widget _buildTimelineItem(BlockchainAudit audit, bool isLast) {
    final color = _eventColor(audit.eventType);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline indicator
          SizedBox(
            width: 40,
            child: Column(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: color.withAlpha(30),
                    shape: BoxShape.circle,
                  ),
                  child:
                      Icon(_eventIcon(audit.eventType), size: 16, color: color),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: Colors.grey.shade200,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Content
          Expanded(
            child: Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: color.withAlpha(20),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            audit.eventType.toUpperCase(),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: color,
                            ),
                          ),
                        ),
                        Text(
                          _formatDate(audit.createdAt),
                          style: TextStyle(
                              fontSize: 11, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (audit.documentId != null)
                      Text(
                        'Document: ${audit.documentId}',
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ...[
                      const SizedBox(height: 6),
                      InkWell(
                        onTap: () {
                          Clipboard.setData(ClipboardData(text: audit.txHash));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('TX hash copied'),
                                duration: Duration(seconds: 1)),
                          );
                        },
                        child: Row(
                          children: [
                            Icon(Icons.tag,
                                size: 14, color: Colors.grey.shade500),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                audit.txHash,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontFamily: 'monospace',
                                  color: Colors.grey.shade600,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Icon(Icons.copy,
                                size: 14, color: Colors.grey.shade400),
                          ],
                        ),
                      ),
                    ],
                    if (audit.details != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        audit.details!,
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '';
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${date.day}/${date.month}/${date.year}';
  }
}
