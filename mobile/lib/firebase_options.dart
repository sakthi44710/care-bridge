import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyBwE16HbIfdF092zzti9-VB3UTa36SLj4g',
    appId: '1:882445520017:web:b8d6025004df5bfe714330',
    messagingSenderId: '882445520017',
    projectId: 'care-bridge-ai-334d0',
    authDomain: 'care-bridge-ai-334d0.firebaseapp.com',
    storageBucket: 'care-bridge-ai-334d0.firebasestorage.app',
    measurementId: 'G-766C9ELT4S',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDoDcjwzeagOj7zODTiNABi6M2-j466vnQ',
    appId: '1:882445520017:android:7424b7200cbd082c714330',
    messagingSenderId: '882445520017',
    projectId: 'care-bridge-ai-334d0',
    storageBucket: 'care-bridge-ai-334d0.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyBwE16HbIfdF092zzti9-VB3UTa36SLj4g',
    appId: '1:882445520017:ios:YOUR_IOS_APP_ID',
    messagingSenderId: '882445520017',
    projectId: 'care-bridge-ai-334d0',
    storageBucket: 'care-bridge-ai-334d0.firebasestorage.app',
    iosBundleId: 'com.carebridge.carebridgeMobile',
  );
}
