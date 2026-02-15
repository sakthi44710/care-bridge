import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:carebridge_mobile/services/api_service.dart';
import 'package:carebridge_mobile/models/models.dart';
import 'package:carebridge_mobile/widgets/common_widgets.dart';
import 'package:carebridge_mobile/config/theme.dart';

class HealthRecordsScreen extends StatefulWidget {
  const HealthRecordsScreen({super.key});

  @override
  State<HealthRecordsScreen> createState() => _HealthRecordsScreenState();
}

class _HealthRecordsScreenState extends State<HealthRecordsScreen> {
  final ApiService _api = ApiService();
  List<HealthRecord> _records = [];
  bool _loading = true;
  String _filter = 'all'; // all, abnormal

  @override
  void initState() {
    super.initState();
    _loadRecords();
  }

  Future<void> _loadRecords() async {
    try {
      final records = await _api.getHealthRecords();
      setState(() {
        _records = records;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<HealthRecord> get _filteredRecords {
    if (_filter == 'abnormal') {
      return _records.where((r) => r.isAbnormal).toList();
    }
    return _records;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Health Records'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: _exportFhir,
            tooltip: 'Export FHIR',
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadRecords,
              child: _records.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 100),
                        EmptyState(
                          icon: Icons.monitor_heart_outlined,
                          title: 'No health records',
                          subtitle:
                              'Upload medical documents to extract health data',
                        ),
                      ],
                    )
                  : _buildContent(),
            ),
    );
  }

  Widget _buildContent() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Summary cards
        _buildSummaryRow(),
        const SizedBox(height: 20),
        // Chart
        if (_records.length >= 2) ...[
          _buildTrendsChart(),
          const SizedBox(height: 20),
        ],
        // Filter chips
        Row(
          children: [
            FilterChip(
              label: const Text('All'),
              selected: _filter == 'all',
              onSelected: (_) => setState(() => _filter = 'all'),
            ),
            const SizedBox(width: 8),
            FilterChip(
              label: Text(
                  'Abnormal (${_records.where((r) => r.isAbnormal).length})'),
              selected: _filter == 'abnormal',
              selectedColor: Colors.red.shade100,
              onSelected: (_) => setState(() => _filter = 'abnormal'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Records list
        ..._filteredRecords.map(_buildRecordCard),
        const SizedBox(height: 12),
        const MedicalDisclaimer(),
      ],
    );
  }

  Widget _buildSummaryRow() {
    final abnormalCount = _records.where((r) => r.isAbnormal).length;
    return Row(
      children: [
        Expanded(
          child: StatsCard(
            title: 'Total Records',
            value: _records.length.toString(),
            icon: Icons.analytics,
            color: AppTheme.primaryColor,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: StatsCard(
            title: 'Abnormal',
            value: abnormalCount.toString(),
            icon: Icons.warning_amber,
            color: Colors.red,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: StatsCard(
            title: 'Normal',
            value: (_records.length - abnormalCount).toString(),
            icon: Icons.check_circle_outline,
            color: Colors.green,
          ),
        ),
      ],
    );
  }

  Widget _buildTrendsChart() {
    // Take recent records with numeric values
    final chartRecords = _records
        .where((r) => r.value != null)
        .take(10)
        .toList()
        .reversed
        .toList();

    if (chartRecords.length < 2) return const SizedBox.shrink();

    final spots = chartRecords.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value.value!);
    }).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Health Trends',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            SizedBox(
              height: 200,
              child: LineChart(
                LineChartData(
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: 1,
                    getDrawingHorizontalLine: (v) => FlLine(
                      color: Colors.grey.shade200,
                      strokeWidth: 1,
                    ),
                  ),
                  titlesData: FlTitlesData(
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 40,
                        getTitlesWidget: (v, _) => Text(
                          v.toStringAsFixed(0),
                          style: TextStyle(
                              fontSize: 10, color: Colors.grey.shade600),
                        ),
                      ),
                    ),
                    bottomTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                    topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false)),
                  ),
                  borderData: FlBorderData(show: false),
                  lineBarsData: [
                    LineChartBarData(
                      spots: spots,
                      isCurved: true,
                      color: AppTheme.primaryColor,
                      barWidth: 2,
                      dotData: FlDotData(
                        show: true,
                        getDotPainter: (spot, pct, bar, i) {
                          final record = chartRecords[i];
                          return FlDotCirclePainter(
                            radius: 4,
                            color: record.isAbnormal
                                ? Colors.red
                                : AppTheme.primaryColor,
                            strokeWidth: 1,
                            strokeColor: Colors.white,
                          );
                        },
                      ),
                      belowBarData: BarAreaData(
                        show: true,
                        color: AppTheme.primaryColor.withAlpha(30),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRecordCard(HealthRecord record) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          radius: 20,
          backgroundColor:
              record.isAbnormal ? Colors.red.shade50 : Colors.green.shade50,
          child: Icon(
            record.isAbnormal ? Icons.warning_amber : Icons.check,
            color: record.isAbnormal ? Colors.red : Colors.green,
            size: 20,
          ),
        ),
        title: Text(record.name,
            style: const TextStyle(fontWeight: FontWeight.w500)),
        subtitle: Text(
          record.category ?? 'General',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              record.value != null
                  ? '${record.value!.toStringAsFixed(1)} ${record.unit ?? ''}'
                  : 'N/A',
              style: TextStyle(
                fontWeight: FontWeight.w600,
                color: record.isAbnormal ? Colors.red : null,
              ),
            ),
            if (record.referenceRange != null)
              Text(
                'Ref: ${record.referenceRange}',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _exportFhir() async {
    try {
      await _api.exportFhir();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('FHIR export started'),
              backgroundColor: Colors.green),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Export failed'), backgroundColor: Colors.red),
        );
      }
    }
  }
}
