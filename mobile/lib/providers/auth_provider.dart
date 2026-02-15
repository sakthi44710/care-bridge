import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:carebridge_mobile/services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api = ApiService();
  final fb.FirebaseAuth _firebaseAuth = fb.FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  fb.User? _user;
  Map<String, dynamic>? _userData;
  bool _isAuthenticated = false;
  bool _isLoading = false;
  String? _error;

  fb.User? get user => _user;
  Map<String, dynamic>? get userData => _userData;
  bool get isAuthenticated => _isAuthenticated;
  bool get isLoading => _isLoading;
  String? get error => _error;

  AuthProvider() {
    _firebaseAuth.authStateChanges().listen(_onAuthStateChanged);
  }

  Future<void> _onAuthStateChanged(fb.User? user) async {
    if (user != null) {
      _user = user;
      final token = await user.getIdToken();
      _api.setToken(token);
      try {
        _userData = await _api.getMe();
        _isAuthenticated = true;
      } catch (_) {
        // User exists in Firebase but not yet in backend — still authenticated
        _isAuthenticated = true;
      }
    } else {
      _user = null;
      _userData = null;
      _isAuthenticated = false;
      _api.clearToken();
    }
    notifyListeners();
  }

  Future<bool> signInWithGoogle() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        _isLoading = false;
        _error = 'Sign in cancelled.';
        notifyListeners();
        return false;
      }

      final GoogleSignInAuthentication googleAuth =
          await googleUser.authentication;

      final credential = fb.GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      await _firebaseAuth.signInWithCredential(credential);
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = 'Google sign-in failed. Please try again.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _googleSignIn.signOut();
      await _firebaseAuth.signOut();
    } catch (_) {}
    _user = null;
    _userData = null;
    _isAuthenticated = false;
    _api.clearToken();
    notifyListeners();
  }
}
