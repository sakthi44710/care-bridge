import 'package:flutter/material.dart';
import 'package:carebridge_mobile/screens/landing_screen.dart';
import 'package:carebridge_mobile/screens/login_screen.dart';
import 'package:carebridge_mobile/screens/dashboard_screen.dart';
import 'package:carebridge_mobile/screens/documents_screen.dart';
import 'package:carebridge_mobile/screens/document_upload_screen.dart';
import 'package:carebridge_mobile/screens/document_detail_screen.dart';
import 'package:carebridge_mobile/screens/chat_screen.dart';
import 'package:carebridge_mobile/screens/health_records_screen.dart';
import 'package:carebridge_mobile/screens/blockchain_screen.dart';
import 'package:carebridge_mobile/screens/my_patients_screen.dart';
import 'package:carebridge_mobile/screens/my_doctors_screen.dart';
import 'package:carebridge_mobile/screens/consultations_screen.dart';

class AppRoutes {
  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case '/':
        return _buildRoute(const LandingScreen());
      case '/login':
        return _buildRoute(const LoginScreen());
      case '/dashboard':
        return _buildRoute(const DashboardScreen());
      case '/documents':
        return _buildRoute(const DocumentsScreen());
      case '/documents/upload':
        return _buildRoute(const DocumentUploadScreen());
      case '/documents/detail':
        final documentId = settings.arguments as String;
        return _buildRoute(DocumentDetailScreen(documentId: documentId));
      case '/chat':
        return _buildRoute(const ChatScreen());
      case '/health':
        return _buildRoute(const HealthRecordsScreen());
      case '/blockchain':
        return _buildRoute(const BlockchainScreen());
      case '/my-patients':
        return _buildRoute(const MyPatientsScreen());
      case '/my-doctors':
        return _buildRoute(const MyDoctorsScreen());
      case '/consultations':
        return _buildRoute(const ConsultationsScreen());
      default:
        return _buildRoute(const LandingScreen());
    }
  }

  static MaterialPageRoute _buildRoute(Widget page) {
    return MaterialPageRoute(builder: (_) => page);
  }
}
