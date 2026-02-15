import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:carebridge_mobile/providers/auth_provider.dart';
import 'package:carebridge_mobile/providers/theme_provider.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiService _api = ApiService();
  List<Document> _recentDocs = [];
  bool _loading = true;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final docs = await _api.getDocuments(perPage: 5);
      setState(() {
        _recentDocs = docs;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  String _getRole(AuthProvider auth) {
    return auth.userData?['role'] ?? 'patient';
  }

  void _onNavTap(int index, String role) {
    final isDoctor = role == 'doctor';
    if (index == 0) return; // Dashboard
    if (index == 1) {
      Navigator.pushNamed(context, '/documents');
    } else if (index == 2) {
      Navigator.pushNamed(context, isDoctor ? '/my-patients' : '/my-doctors');
    } else if (index == 3) {
      Navigator.pushNamed(context, '/consultations');
    } else if (index == 4) {
      Navigator.pushNamed(context, '/chat');
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final theme = context.watch<ThemeProvider>();
    final role = _getRole(auth);
    final isDoctor = role == 'doctor';

    return Scaffold(
      appBar: AppBar(
        title: const Text('CareBridge',
            style: TextStyle(fontWeight: FontWeight.bold)),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: Icon(theme.isDark ? Icons.light_mode : Icons.dark_mode),
            onPressed: theme.toggleTheme,
          ),
          PopupMenuButton<String>(
            icon: const CircleAvatar(
              radius: 16,
              child: Icon(Icons.person, size: 18),
            ),
            itemBuilder: (context) => <PopupMenuEntry<String>>[
              PopupMenuItem<String>(
                enabled: false,
                child: Text(auth.user?.displayName ?? 'User',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              PopupMenuItem<String>(
                enabled: false,
                child: Text(auth.user?.email ?? '',
                    style:
                        TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ),
              const PopupMenuDivider(),
              PopupMenuItem<String>(
                value: 'blockchain',
                child: const Row(
                  children: [
                    Icon(Icons.shield_outlined, size: 18),
                    SizedBox(width: 8),
                    Text('Blockchain'),
                  ],
                ),
                onTap: () {
                  if (!context.mounted) return;
                  Navigator.pushNamed(context, '/blockchain');
                },
              ),
              PopupMenuItem<String>(
                value: 'logout',
                child: const Row(
                  children: [
                    Icon(Icons.logout, size: 18, color: AppTheme.errorColor),
                    SizedBox(width: 8),
                    Text('Logout',
                        style: TextStyle(color: AppTheme.errorColor)),
                  ],
                ),
                onTap: () async {
                  await auth.logout();
                  if (!context.mounted) return;
                  Navigator.pushReplacementNamed(context, '/login');
                },
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Welcome
                    Text(
                      'Welcome, ${auth.user?.displayName ?? 'User'}',
                      style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Your healthcare documents dashboard',
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 24),

                    // Stats
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.4,
                      children: [
                        StatsCard(
                          icon: Icons.description,
                          title: 'Documents',
                          value: '${_recentDocs.length}',
                          onTap: () =>
                              Navigator.pushNamed(context, '/documents'),
                        ),
                        StatsCard(
                          icon:
                              isDoctor ? Icons.people : Icons.medical_services,
                          title: isDoctor ? 'My Patients' : 'My Doctors',
                          value: 'View',
                          color: AppTheme.secondaryColor,
                          onTap: () => Navigator.pushNamed(context,
                              isDoctor ? '/my-patients' : '/my-doctors'),
                        ),
                        StatsCard(
                          icon: Icons.medical_information,
                          title: 'Consultations',
                          value: 'View',
                          color: Colors.orange,
                          onTap: () =>
                              Navigator.pushNamed(context, '/consultations'),
                        ),
                        StatsCard(
                          icon: Icons.chat_bubble_outline,
                          title: 'AI Chat',
                          value: 'Start',
                          color: AppTheme.successColor,
                          onTap: () => Navigator.pushNamed(context, '/chat'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Quick Actions
                    const Text('Quick Actions',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _QuickAction(
                            icon: Icons.upload_file,
                            label: 'Upload',
                            onTap: () => Navigator.pushNamed(
                                context, '/documents/upload'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _QuickAction(
                            icon: isDoctor
                                ? Icons.people
                                : Icons.medical_services,
                            label: isDoctor ? 'Patients' : 'Doctors',
                            onTap: () => Navigator.pushNamed(context,
                                isDoctor ? '/my-patients' : '/my-doctors'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _QuickAction(
                            icon: Icons.chat,
                            label: 'AI Chat',
                            onTap: () => Navigator.pushNamed(context, '/chat'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Recent Documents
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Recent Documents',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w600)),
                        TextButton(
                          onPressed: () =>
                              Navigator.pushNamed(context, '/documents'),
                          child: const Text('View All'),
                        ),
                      ],
                    ),
                    if (_recentDocs.isEmpty)
                      const EmptyState(
                        icon: Icons.description_outlined,
                        title: 'No documents yet',
                        subtitle: 'Upload your first healthcare document',
                      )
                    else
                      ..._recentDocs.map((doc) => _DocumentTile(doc: doc)),

                    const MedicalDisclaimer(),
                  ],
                ),
              ),
            ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) {
          setState(() => _currentIndex = i);
          _onNavTap(i, role);
        },
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          const NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder),
            label: 'Documents',
          ),
          NavigationDestination(
            icon: Icon(isDoctor
                ? Icons.people_outline
                : Icons.medical_services_outlined),
            selectedIcon:
                Icon(isDoctor ? Icons.people : Icons.medical_services),
            label: isDoctor ? 'Patients' : 'Doctors',
          ),
          const NavigationDestination(
            icon: Icon(Icons.medical_information_outlined),
            selectedIcon: Icon(Icons.medical_information),
            label: 'Consults',
          ),
          const NavigationDestination(
            icon: Icon(Icons.chat_outlined),
            selectedIcon: Icon(Icons.chat),
            label: 'AI Chat',
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            children: [
              Icon(icon, color: AppTheme.primaryColor),
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  final Document doc;

  const _DocumentTile({required this.doc});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.description, color: AppTheme.primaryColor),
        title: Text(doc.filename, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${doc.documentType} • ${formatFileSize(doc.fileSize ?? 0)}',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
        trailing: doc.blockchainTxHash != null
            ? const Icon(Icons.verified, color: AppTheme.successColor, size: 20)
            : null,
        onTap: () => Navigator.pushNamed(context, '/documents/detail',
            arguments: doc.id),
      ),
    );
  }
}
