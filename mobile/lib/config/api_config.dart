class ApiConfig {
  // Change this to your backend URL
  static const String baseUrl =
      'http://10.0.2.2:8000'; // Android emulator -> localhost
  static const String apiPath = '/api/v1';
  static String get apiUrl => '$baseUrl$apiPath';

  // Timeouts
  static const int connectTimeout = 30000;
  static const int receiveTimeout = 30000;
  static const int sendTimeout = 60000;
}
