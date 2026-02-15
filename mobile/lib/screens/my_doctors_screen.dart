import 'package:flutter/material.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/config/theme.dart';

class MyDoctorsScreen extends StatefulWidget {
  const MyDoctorsScreen({super.key});

  @override
  State<MyDoctorsScreen> createState() => _MyDoctorsScreenState();
}

class _MyDoctorsScreenState extends State<MyDoctorsScreen>
    with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;

  // Data
  List<DoctorInfo> _doctors = [];
  List<SentAppointmentRequest> _sentRequests = [];
  List<DocAccessRequest> _docAccessRequests = [];
  List<AvailableDoctor> _availableDoctors = [];
  bool _loading = true;
  bool _directoryLoading = false;
  String? _error;
  String? _actionLoadingId;

  // Search
  String _searchQuery = '';
  String _selectedDepartment = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
    _loadAvailableDoctors();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final doctors = await _api.getMyDoctors();
      final sent = await _api.getMyAppointmentRequests();
      final docReqs = await _api.getDocumentAccessRequests();
      if (mounted) {
        setState(() {
          _doctors = doctors;
          _sentRequests = sent;
          _docAccessRequests = docReqs;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load data';
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadAvailableDoctors() async {
    setState(() => _directoryLoading = true);
    try {
      final docs = await _api.getAvailableDoctors();
      if (mounted) setState(() => _availableDoctors = docs);
    } catch (_) {}
    if (mounted) setState(() => _directoryLoading = false);
  }

  Future<void> _bookAppointment(AvailableDoctor doctor) async {
    final messageController = TextEditingController();
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Book with Dr. ${doctor.name}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${doctor.department.isNotEmpty ? doctor.department : doctor.specialty}'
              '${doctor.hospital.isNotEmpty ? " at ${doctor.hospital}" : ""}',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: messageController,
              decoration: const InputDecoration(
                labelText: 'Message (optional)',
                hintText: 'Describe why you\'d like a consultation...',
                border: OutlineInputBorder(),
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              maxLines: 3,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon: const Icon(Icons.send, size: 16),
            label: const Text('Send Request'),
          ),
        ],
      ),
    );

    if (result == true && mounted) {
      try {
        await _api.requestAppointment(doctor.id, messageController.text.trim());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Appointment request sent!'),
            backgroundColor: Colors.green,
          ),
        );
        _loadData();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().contains('already have')
                ? 'You already have a connection with this doctor'
                : 'Failed to send request'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
    messageController.dispose();
  }

  Future<void> _respondDocAccess(String linkId, String action) async {
    setState(() => _actionLoadingId = linkId);
    try {
      await _api.respondDocumentAccess(linkId, action);
      await _loadData();
    } catch (e) {
      setState(() => _error = 'Failed to $action document access');
    } finally {
      if (mounted) setState(() => _actionLoadingId = null);
    }
  }

  List<String> get _departments {
    final depts = _availableDoctors
        .map((d) => d.department.isNotEmpty ? d.department : d.specialty)
        .where((d) => d.isNotEmpty)
        .toSet()
        .toList();
    depts.sort();
    return depts;
  }

  List<AvailableDoctor> get _filteredDoctors {
    return _availableDoctors.where((d) {
      final q = _searchQuery.toLowerCase();
      final matchesSearch = q.isEmpty ||
          d.name.toLowerCase().contains(q) ||
          d.specialty.toLowerCase().contains(q) ||
          d.hospital.toLowerCase().contains(q);
      final dept = d.department.isNotEmpty ? d.department : d.specialty;
      final matchesDept =
          _selectedDepartment.isEmpty || dept == _selectedDepartment;
      return matchesSearch && matchesDept;
    }).toList();
  }

  Widget _docAccessBadge(String access) {
    if (access == 'granted') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_open, size: 12, color: Colors.green.shade700),
            const SizedBox(width: 4),
            Text('Docs Shared',
                style: TextStyle(
                    fontSize: 11,
                    color: Colors.green.shade700,
                    fontWeight: FontWeight.w500)),
          ],
        ),
      );
    } else if (access == 'requested') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.orange.shade50,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_clock, size: 12, color: Colors.orange.shade700),
            const SizedBox(width: 4),
            Text('Docs Requested',
                style: TextStyle(
                    fontSize: 11,
                    color: Colors.orange.shade700,
                    fontWeight: FontWeight.w500)),
          ],
        ),
      );
    } else if (access == 'denied') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock, size: 12, color: Colors.red.shade700),
            const SizedBox(width: 4),
            Text('Docs Denied',
                style: TextStyle(
                    fontSize: 11,
                    color: Colors.red.shade700,
                    fontWeight: FontWeight.w500)),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Doctors'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.search), text: 'Find a Doctor'),
            Tab(icon: Icon(Icons.favorite), text: 'My Doctors'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildDirectoryTab(),
                _buildMyDoctorsTab(),
              ],
            ),
    );
  }

  // ── Tab 1: Doctor Directory ──────────────────────────────
  Widget _buildDirectoryTab() {
    return RefreshIndicator(
      onRefresh: _loadAvailableDoctors,
      child: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _searchQuery = v),
              decoration: InputDecoration(
                hintText: 'Search by name, specialty, or hospital...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
          ),

          // Department filter chips
          if (_departments.isNotEmpty)
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: FilterChip(
                      label: const Text('All'),
                      selected: _selectedDepartment.isEmpty,
                      onSelected: (_) =>
                          setState(() => _selectedDepartment = ''),
                    ),
                  ),
                  ..._departments.map((dept) => Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: FilterChip(
                          label: Text(dept),
                          selected: _selectedDepartment == dept,
                          onSelected: (_) =>
                              setState(() => _selectedDepartment = dept),
                        ),
                      )),
                ],
              ),
            ),

          const SizedBox(height: 8),

          // Doctor list
          Expanded(
            child: _directoryLoading
                ? const Center(child: CircularProgressIndicator())
                : _filteredDoctors.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.people_outline,
                                size: 48, color: Colors.grey.shade400),
                            const SizedBox(height: 8),
                            Text(
                              _searchQuery.isNotEmpty ||
                                      _selectedDepartment.isNotEmpty
                                  ? 'No doctors match your search'
                                  : 'No doctors available',
                              style: const TextStyle(color: Colors.grey),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _filteredDoctors.length,
                        itemBuilder: (ctx, i) {
                          final doc = _filteredDoctors[i];
                          final alreadyConnected = _doctors
                                  .any((d) => d.doctorId == doc.id) ||
                              _sentRequests.any((r) => r.doctorId == doc.id);
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    backgroundColor: Colors.indigo.shade50,
                                    child: const Icon(Icons.medical_services,
                                        color: Colors.indigo),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Dr. ${doc.name.isNotEmpty ? doc.name : "Doctor"}',
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w600),
                                        ),
                                        const SizedBox(height: 2),
                                        Wrap(
                                          spacing: 4,
                                          runSpacing: 2,
                                          children: [
                                            if ((doc.department.isNotEmpty
                                                    ? doc.department
                                                    : doc.specialty)
                                                .isNotEmpty)
                                              Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 6,
                                                        vertical: 1),
                                                decoration: BoxDecoration(
                                                  color: Colors.indigo.shade50,
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                                child: Text(
                                                  doc.department.isNotEmpty
                                                      ? doc.department
                                                      : doc.specialty,
                                                  style: TextStyle(
                                                      fontSize: 11,
                                                      color: Colors
                                                          .indigo.shade700),
                                                ),
                                              ),
                                            if (doc.yearsOfExperience != null)
                                              Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                        horizontal: 6,
                                                        vertical: 1),
                                                decoration: BoxDecoration(
                                                  color: Colors.grey.shade100,
                                                  borderRadius:
                                                      BorderRadius.circular(8),
                                                ),
                                                child: Text(
                                                  '${doc.yearsOfExperience} yrs exp',
                                                  style: TextStyle(
                                                      fontSize: 11,
                                                      color:
                                                          Colors.grey.shade600),
                                                ),
                                              ),
                                          ],
                                        ),
                                        if (doc.hospital.isNotEmpty) ...[
                                          const SizedBox(height: 2),
                                          Row(
                                            children: [
                                              Icon(Icons.business,
                                                  size: 12,
                                                  color: Colors.grey.shade500),
                                              const SizedBox(width: 4),
                                              Expanded(
                                                child: Text(doc.hospital,
                                                    style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors
                                                            .grey.shade600),
                                                    overflow:
                                                        TextOverflow.ellipsis),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  alreadyConnected
                                      ? Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: Colors.green.shade50,
                                            borderRadius:
                                                BorderRadius.circular(12),
                                          ),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              Icon(Icons.check_circle,
                                                  size: 14,
                                                  color: Colors.green.shade700),
                                              const SizedBox(width: 4),
                                              Text(
                                                _doctors.any((d) =>
                                                        d.doctorId == doc.id)
                                                    ? 'Connected'
                                                    : 'Sent',
                                                style: TextStyle(
                                                    fontSize: 11,
                                                    color:
                                                        Colors.green.shade700),
                                              ),
                                            ],
                                          ),
                                        )
                                      : ElevatedButton(
                                          onPressed: () =>
                                              _bookAppointment(doc),
                                          style: ElevatedButton.styleFrom(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 12, vertical: 8),
                                          ),
                                          child: const Text('Book',
                                              style: TextStyle(fontSize: 13)),
                                        ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  // ── Tab 2: My Active Doctors, Requests, Doc Access ──────
  Widget _buildMyDoctorsTab() {
    return RefreshIndicator(
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
                  const Icon(Icons.error_outline, color: Colors.red, size: 18),
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

          // Document Access Requests
          if (_docAccessRequests.isNotEmpty) ...[
            Row(
              children: [
                Icon(Icons.shield, color: Colors.orange.shade700, size: 20),
                const SizedBox(width: 8),
                Text('Document Access Requests (${_docAccessRequests.length})',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 8),
            ..._docAccessRequests.map((req) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  color: Colors.orange.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 20,
                              backgroundColor: Colors.orange.shade100,
                              child:
                                  const Icon(Icons.lock, color: Colors.orange),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Dr. ${req.doctorName.isNotEmpty ? req.doctorName : "Doctor"}',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                  const Text(
                                      'wants to access your medical documents',
                                      style: TextStyle(
                                          fontSize: 12, color: Colors.orange)),
                                  Text(req.doctorEmail,
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey.shade600)),
                                  if (req.doctorSpecialty.isNotEmpty)
                                    Text(req.doctorSpecialty,
                                        style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey.shade500)),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            OutlinedButton.icon(
                              onPressed: _actionLoadingId == req.linkId
                                  ? null
                                  : () =>
                                      _respondDocAccess(req.linkId, 'reject'),
                              icon: const Icon(Icons.close, size: 16),
                              label: const Text('Deny'),
                              style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.red),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton.icon(
                              onPressed: _actionLoadingId == req.linkId
                                  ? null
                                  : () =>
                                      _respondDocAccess(req.linkId, 'accept'),
                              icon: _actionLoadingId == req.linkId
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))
                                  : const Icon(Icons.lock_open, size: 16),
                              label: const Text('Grant Access'),
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

          // Pending Sent Requests
          if (_sentRequests.isNotEmpty) ...[
            Row(
              children: [
                const Icon(Icons.access_time, color: Colors.amber, size: 20),
                const SizedBox(width: 8),
                Text('Pending Requests (${_sentRequests.length})',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 8),
            ..._sentRequests.map((req) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  color: Colors.amber.shade50,
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: Colors.amber.shade100,
                      child:
                          const Icon(Icons.hourglass_top, color: Colors.amber),
                    ),
                    title: Text(
                        req.doctorName.isNotEmpty ? req.doctorName : 'Doctor',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(req.doctorEmail,
                            style: const TextStyle(fontSize: 12)),
                        if (req.doctorSpecialty.isNotEmpty)
                          Text(req.doctorSpecialty,
                              style: TextStyle(
                                  fontSize: 11, color: Colors.grey.shade500)),
                        if (req.message.isNotEmpty)
                          Text('"${req.message}"',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                  color: Colors.grey.shade600)),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade100,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text('Awaiting',
                          style: TextStyle(
                              fontSize: 11, color: Colors.amber.shade800)),
                    ),
                  ),
                )),
            const SizedBox(height: 16),
          ],

          // Active Doctors
          Text('My Doctors (${_doctors.length})',
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          if (_doctors.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(Icons.medical_services_outlined,
                        size: 48, color: Colors.grey.shade400),
                    const SizedBox(height: 8),
                    const Text('No doctors yet',
                        style: TextStyle(color: Colors.grey)),
                    const SizedBox(height: 4),
                    Text(
                      'Go to "Find a Doctor" to browse and book a consultation.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade500),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          else
            ..._doctors.map((doctor) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: Colors.blue.shade50,
                          child: const Icon(Icons.medical_services,
                              color: AppTheme.primaryColor),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                        doctor.name.isNotEmpty
                                            ? doctor.name
                                            : 'Doctor',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600)),
                                  ),
                                  const SizedBox(width: 8),
                                  _docAccessBadge(doctor.documentAccess),
                                ],
                              ),
                              Text(doctor.email,
                                  style: const TextStyle(fontSize: 12)),
                              if (doctor.specialty.isNotEmpty ||
                                  doctor.hospital.isNotEmpty)
                                Text(
                                  [
                                    if (doctor.specialty.isNotEmpty)
                                      doctor.specialty,
                                    if (doctor.hospital.isNotEmpty)
                                      doctor.hospital,
                                  ].join(' • '),
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey.shade500),
                                ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send,
                              color: AppTheme.primaryColor),
                          tooltip: 'Request Consultation',
                          onPressed: () =>
                              Navigator.pushNamed(context, '/consultations'),
                        ),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
