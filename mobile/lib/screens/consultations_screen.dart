import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:carebridge_mobile/providers/auth_provider.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/config/theme.dart';

class ConsultationsScreen extends StatefulWidget {
  const ConsultationsScreen({super.key});

  @override
  State<ConsultationsScreen> createState() => _ConsultationsScreenState();
}

class _ConsultationsScreenState extends State<ConsultationsScreen> {
  final ApiService _api = ApiService();
  List<Consultation> _consultations = [];
  bool _loading = true;
  @override
  void initState() {
    super.initState();
    _loadConsultations();
  }

  Future<void> _loadConsultations() async {
    try {
      final list = await _api.listConsultations();
      setState(() {
        _consultations = list;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
      });
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'pending_payment':
        return Colors.orange;
      case 'in_review':
        return Colors.blue;
      case 'completed':
        return AppTheme.successColor;
      default:
        return Colors.grey;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'pending_payment':
        return Icons.payment;
      case 'in_review':
        return Icons.hourglass_top;
      case 'completed':
        return Icons.check_circle;
      default:
        return Icons.info;
    }
  }

  String _statusLabel(String status) {
    return status.replaceAll('_', ' ').toUpperCase();
  }

  Future<void> _payConsultation(String id) async {
    try {
      await _api.payConsultation(id);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Payment successful!'),
          backgroundColor: AppTheme.successColor,
        ),
      );
      _loadConsultations();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Payment failed')),
      );
    }
  }

  void _showRespondDialog(Consultation c) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Respond to Consultation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Patient: ${c.patientName.isNotEmpty ? c.patientName : c.patientEmail}'),
            const SizedBox(height: 4),
            Text('Message: ${c.message}',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Your Response',
                hintText: 'Enter your medical response...',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (controller.text.trim().isEmpty) return;
              Navigator.pop(ctx);
              try {
                await _api.respondConsultation(c.id, controller.text.trim());
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Response sent'),
                    backgroundColor: AppTheme.successColor,
                  ),
                );
                _loadConsultations();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Failed to send response')),
                );
              }
            },
            child: const Text('Send Response'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final role = auth.userData?['role'] ?? 'patient';
    final isDoctor = role == 'doctor';

    return Scaffold(
      appBar: AppBar(title: const Text('Consultations')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadConsultations,
              child: _consultations.isEmpty
                  ? ListView(
                      children: [
                        const SizedBox(height: 100),
                        Center(
                          child: Column(
                            children: [
                              Icon(Icons.medical_information_outlined,
                                  size: 64, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              const Text('No consultations yet',
                                  style: TextStyle(
                                      fontSize: 16, color: Colors.grey)),
                              const SizedBox(height: 4),
                              Text(
                                isDoctor
                                    ? 'Consultations from patients will appear here.'
                                    : 'Request a consultation from the My Doctors page.',
                                style: TextStyle(
                                    fontSize: 13, color: Colors.grey.shade500),
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _consultations.length,
                      itemBuilder: (ctx, i) {
                        final c = _consultations[i];
                        return _ConsultationCard(
                          consultation: c,
                          isDoctor: isDoctor,
                          statusColor: _statusColor(c.status),
                          statusIcon: _statusIcon(c.status),
                          statusLabel: _statusLabel(c.status),
                          onPay: () => _payConsultation(c.id),
                          onRespond: () => _showRespondDialog(c),
                        );
                      },
                    ),
            ),
    );
  }
}

class _ConsultationCard extends StatelessWidget {
  final Consultation consultation;
  final bool isDoctor;
  final Color statusColor;
  final IconData statusIcon;
  final String statusLabel;
  final VoidCallback onPay;
  final VoidCallback onRespond;

  const _ConsultationCard({
    required this.consultation,
    required this.isDoctor,
    required this.statusColor,
    required this.statusIcon,
    required this.statusLabel,
    required this.onPay,
    required this.onRespond,
  });

  @override
  Widget build(BuildContext context) {
    final c = consultation;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Text(
                    isDoctor
                        ? 'From: ${c.patientName.isNotEmpty ? c.patientName : c.patientEmail}'
                        : 'To: ${c.doctorName.isNotEmpty ? c.doctorName : c.doctorEmail}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 15),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withAlpha(25),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColor.withAlpha(75)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(statusIcon, size: 14, color: statusColor),
                      const SizedBox(width: 4),
                      Text(statusLabel,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: statusColor)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Message
            Text(c.message,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            const SizedBox(height: 4),

            // Payment info
            if (c.paymentAmount > 0)
              Row(
                children: [
                  Icon(Icons.currency_rupee,
                      size: 14, color: Colors.grey.shade500),
                  Text('${c.paymentAmount}',
                      style:
                          TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                  const SizedBox(width: 8),
                  Text('• ${c.paymentStatus.replaceAll('_', ' ')}',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ],
              ),
            const SizedBox(height: 4),

            // Documents count
            if (c.documentIds.isNotEmpty)
              Text('${c.documentIds.length} document(s) attached',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),

            // Doctor response
            if (c.doctorResponse.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.green.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.green.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Doctor\'s Response',
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                            color: AppTheme.successColor)),
                    const SizedBox(height: 4),
                    Text(c.doctorResponse,
                        style: const TextStyle(fontSize: 13)),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 8),

            // Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!isDoctor && c.status == 'pending_payment')
                  ElevatedButton.icon(
                    onPressed: onPay,
                    icon: const Icon(Icons.payment, size: 18),
                    label: Text('Pay ₹${c.paymentAmount}'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange),
                  ),
                if (isDoctor && c.status == 'in_review')
                  ElevatedButton.icon(
                    onPressed: onRespond,
                    icon: const Icon(Icons.reply, size: 18),
                    label: const Text('Respond'),
                    style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
