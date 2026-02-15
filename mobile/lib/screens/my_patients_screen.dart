import 'package:flutter/material.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/config/theme.dart';
import 'package:url_launcher/url_launcher.dart';

class MyPatientsScreen extends StatefulWidget {
  const MyPatientsScreen({super.key});

  @override
  State<MyPatientsScreen> createState() => _MyPatientsScreenState();
}

class _MyPatientsScreenState extends State<MyPatientsScreen> {
  final ApiService _api = ApiService();
  List<PatientLink> _patients = [];
  List<AppointmentRequest> _appointmentRequests = [];
  bool _loading = true;
  String? _error;
  String? _actionLoadingId;

  // Document viewer
  PatientLink? _selectedPatient;
  List<PatientDocument> _documents = [];
  bool _docsLoading = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final patients = await _api.getMyPatients();
      final requests = await _api.getAppointmentRequests();
      setState(() {
        _patients = patients;
        _appointmentRequests = requests;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load data';
        _loading = false;
      });
    }
  }

  Future<void> _respondAppointment(String linkId, String action) async {
    setState(() => _actionLoadingId = linkId);
    try {
      await _api.respondAppointmentRequest(linkId, action);
      await _loadData();
    } catch (e) {
      setState(() => _error = 'Failed to $action appointment');
    } finally {
      setState(() => _actionLoadingId = null);
    }
  }

  Future<void> _requestDocuments(String linkId) async {
    setState(() => _actionLoadingId = linkId);
    try {
      await _api.requestDocumentAccess(linkId);
      await _loadData();
    } catch (e) {
      setState(() => _error = 'Failed to request documents');
    } finally {
      setState(() => _actionLoadingId = null);
    }
  }

  Future<void> _unlinkPatient(String linkId) async {
    try {
      await _api.unlinkPatient(linkId);
      _loadData();
      if (_selectedPatient?.linkId == linkId) {
        setState(() {
          _selectedPatient = null;
          _documents = [];
        });
      }
    } catch (e) {
      setState(() => _error = 'Failed to unlink patient');
    }
  }

  Future<void> _viewDocuments(PatientLink patient) async {
    if (patient.documentAccess != 'granted') return;
    setState(() {
      _selectedPatient = patient;
      _docsLoading = true;
    });
    try {
      final docs = await _api.getPatientDocuments(patient.patientId);
      setState(() {
        _documents = docs;
        _docsLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load documents';
        _docsLoading = false;
      });
    }
  }

  Future<void> _openDocument(PatientDocument doc) async {
    if (doc.downloadUrl != null) {
      final uri = Uri.parse(doc.downloadUrl!);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }
  }

  Widget _docAccessBadge(String access) {
    Color bgColor;
    Color textColor;
    IconData icon;
    String label;

    switch (access) {
      case 'granted':
        bgColor = Colors.green.shade50;
        textColor = Colors.green.shade700;
        icon = Icons.lock_open;
        label = 'Docs Shared';
        break;
      case 'requested':
        bgColor = Colors.orange.shade50;
        textColor = Colors.orange.shade700;
        icon = Icons.lock_clock;
        label = 'Requested';
        break;
      case 'denied':
        bgColor = Colors.red.shade50;
        textColor = Colors.red.shade700;
        icon = Icons.lock;
        label = 'Denied';
        break;
      default:
        bgColor = Colors.grey.shade100;
        textColor = Colors.grey.shade600;
        icon = Icons.lock;
        label = 'No Access';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: textColor),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 11, color: textColor, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Patients')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Error
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline,
                              color: Colors.red, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                              child: Text(_error!,
                                  style: const TextStyle(
                                      color: Colors.red, fontSize: 13))),
                          IconButton(
                            icon: const Icon(Icons.close, size: 16),
                            onPressed: () => setState(() => _error = null),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Appointment Requests
                  if (_appointmentRequests.isNotEmpty) ...[
                    Row(
                      children: [
                        Icon(Icons.notifications_active,
                            color: Colors.orange.shade700, size: 20),
                        const SizedBox(width: 8),
                        Text(
                            'Appointment Requests (${_appointmentRequests.length})',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    ..._appointmentRequests.map((req) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          color: Colors.orange.shade50,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.person,
                                        size: 20, color: Colors.orange),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        req.patientName.isNotEmpty
                                            ? req.patientName
                                            : 'Patient',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(req.patientEmail,
                                    style: TextStyle(
                                        fontSize: 13,
                                        color: Colors.grey.shade600)),
                                if (req.message.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text('"${req.message}"',
                                      style: TextStyle(
                                          fontSize: 13,
                                          fontStyle: FontStyle.italic,
                                          color: Colors.grey.shade700)),
                                ],
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    OutlinedButton.icon(
                                      onPressed: _actionLoadingId == req.linkId
                                          ? null
                                          : () => _respondAppointment(
                                              req.linkId, 'reject'),
                                      icon: const Icon(Icons.close, size: 16),
                                      label: const Text('Reject'),
                                      style: OutlinedButton.styleFrom(
                                          foregroundColor: Colors.red),
                                    ),
                                    const SizedBox(width: 8),
                                    ElevatedButton.icon(
                                      onPressed: _actionLoadingId == req.linkId
                                          ? null
                                          : () => _respondAppointment(
                                              req.linkId, 'accept'),
                                      icon: _actionLoadingId == req.linkId
                                          ? const SizedBox(
                                              width: 16,
                                              height: 16,
                                              child: CircularProgressIndicator(
                                                  strokeWidth: 2))
                                          : const Icon(Icons.check, size: 16),
                                      label: const Text('Accept'),
                                      style: ElevatedButton.styleFrom(
                                          backgroundColor: Colors.green),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        )),
                    const SizedBox(height: 16),
                  ],

                  // Patient List
                  Text('Patients (${_patients.length})',
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  if (_patients.isEmpty)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            Icon(Icons.people_outline,
                                size: 48, color: Colors.grey.shade400),
                            const SizedBox(height: 8),
                            const Text('No patients yet',
                                style: TextStyle(color: Colors.grey)),
                            const SizedBox(height: 4),
                            const Text(
                                'When a patient requests an appointment and you accept, they appear here.',
                                style:
                                    TextStyle(color: Colors.grey, fontSize: 12),
                                textAlign: TextAlign.center),
                          ],
                        ),
                      ),
                    )
                  else
                    ..._patients.map((p) => Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          shape: _selectedPatient?.patientId == p.patientId
                              ? RoundedRectangleBorder(
                                  side: const BorderSide(
                                      color: AppTheme.primaryColor, width: 2),
                                  borderRadius: BorderRadius.circular(12))
                              : null,
                          child: InkWell(
                            onTap: p.documentAccess == 'granted'
                                ? () => _viewDocuments(p)
                                : null,
                            borderRadius: BorderRadius.circular(12),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Text(
                                                p.name.isNotEmpty
                                                    ? p.name
                                                    : 'Patient',
                                                style: const TextStyle(
                                                    fontWeight:
                                                        FontWeight.w600)),
                                            const SizedBox(width: 8),
                                            _docAccessBadge(p.documentAccess),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(p.email,
                                            style: TextStyle(
                                                fontSize: 13,
                                                color: Colors.grey.shade600)),
                                      ],
                                    ),
                                  ),
                                  // Request Docs button
                                  if (p.documentAccess == 'none' ||
                                      p.documentAccess == 'denied')
                                    TextButton.icon(
                                      onPressed: _actionLoadingId == p.linkId
                                          ? null
                                          : () => _requestDocuments(p.linkId),
                                      icon: _actionLoadingId == p.linkId
                                          ? const SizedBox(
                                              width: 14,
                                              height: 14,
                                              child: CircularProgressIndicator(
                                                  strokeWidth: 2))
                                          : const Icon(Icons.description,
                                              size: 16),
                                      label: Text(
                                          p.documentAccess == 'denied'
                                              ? 'Re-request'
                                              : 'Request Docs',
                                          style: const TextStyle(fontSize: 12)),
                                    ),
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline,
                                        color: AppTheme.errorColor, size: 20),
                                    onPressed: () {
                                      showDialog(
                                        context: context,
                                        builder: (ctx) => AlertDialog(
                                          title: const Text('Unlink Patient?'),
                                          content: const Text(
                                              'Remove this patient from your care list?'),
                                          actions: [
                                            TextButton(
                                                onPressed: () =>
                                                    Navigator.pop(ctx),
                                                child: const Text('Cancel')),
                                            TextButton(
                                                onPressed: () {
                                                  Navigator.pop(ctx);
                                                  _unlinkPatient(p.linkId);
                                                },
                                                child: const Text('Remove',
                                                    style: TextStyle(
                                                        color: AppTheme
                                                            .errorColor))),
                                          ],
                                        ),
                                      );
                                    },
                                  ),
                                  if (p.documentAccess == 'granted')
                                    const Icon(Icons.chevron_right,
                                        color: Colors.grey),
                                ],
                              ),
                            ),
                          ),
                        )),

                  // Documents Panel
                  if (_selectedPatient != null) ...[
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '${_selectedPatient!.name}\'s Documents',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () => setState(() {
                            _selectedPatient = null;
                            _documents = [];
                          }),
                        ),
                      ],
                    ),
                    if (_docsLoading)
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (_documents.isEmpty)
                      const Card(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(
                            child: Text('No documents found',
                                style: TextStyle(color: Colors.grey)),
                          ),
                        ),
                      )
                    else
                      ..._documents.map((doc) => Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: const Icon(Icons.description,
                                  color: AppTheme.primaryColor),
                              title: Text(doc.filename,
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              subtitle: Text(doc.documentType),
                              trailing: doc.downloadUrl != null
                                  ? IconButton(
                                      icon: const Icon(Icons.download,
                                          color: AppTheme.primaryColor),
                                      onPressed: () => _openDocument(doc),
                                    )
                                  : null,
                              onTap: () => _openDocument(doc),
                            ),
                          )),
                  ],
                ],
              ),
            ),
    );
  }
}
