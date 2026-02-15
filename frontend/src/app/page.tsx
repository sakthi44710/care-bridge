'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Shield, Heart, Brain, FileText, Lock, Activity } from 'lucide-react';

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 overflow-y-auto">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-8 w-8 text-primary fill-primary" />
            <span className="text-2xl font-bold text-foreground">CareBridge</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition">Features</a>
            <a href="#security" className="text-muted-foreground hover:text-foreground transition">Security</a>
            <a href="#ai" className="text-muted-foreground hover:text-foreground transition">AI Insights</a>
            {isAuthenticated ? (
              <a href="/dashboard" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
                Dashboard
              </a>
            ) : (
              <a href="/login" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition">
                Sign In
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            AI-Powered Healthcare
            <span className="text-primary"> Document Intelligence</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Securely manage your medical documents with blockchain integrity verification,
            AI-powered analysis, and FHIR-compliant health records.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/login"
              className="bg-primary text-primary-foreground px-8 py-3 rounded-lg text-lg font-medium hover:opacity-90 transition shadow-lg"
            >
              Get Started
            </a>
            <a
              href="#features"
              className="border border-border px-8 py-3 rounded-lg text-lg font-medium hover:bg-muted transition"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Platform Features</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Brain className="h-10 w-10 text-primary" />}
            title="AI-Powered Analysis"
            description="Mixture of Experts AI system analyzes lab reports, prescriptions, and imaging results with medical safety guardrails."
          />
          <FeatureCard
            icon={<Lock className="h-10 w-10 text-primary" />}
            title="Blockchain Integrity"
            description="Every document is anchored to Hyperledger Fabric blockchain for tamper-proof integrity verification."
          />
          <FeatureCard
            icon={<FileText className="h-10 w-10 text-primary" />}
            title="FHIR Compliance"
            description="Health records automatically extracted and stored in HL7 FHIR format for interoperability."
          />
          <FeatureCard
            icon={<Shield className="h-10 w-10 text-primary" />}
            title="Client-Side Encryption"
            description="Documents encrypted before upload with Vault-managed keys. Zero-knowledge architecture."
          />
          <FeatureCard
            icon={<Activity className="h-10 w-10 text-primary" />}
            title="Health Trends"
            description="Visualize health data trends over time with interactive charts and abnormality detection."
          />
          <FeatureCard
            icon={<Heart className="h-10 w-10 text-primary" />}
            title="Access Control"
            description="Granular blockchain-backed access control. Share documents securely with healthcare providers."
          />
        </div>
      </section>

      {/* Medical Disclaimer */}
      <section className="container mx-auto px-4 py-8">
        <div className="medical-disclaimer rounded-lg">
          <strong>Medical Disclaimer:</strong> CareBridge provides document analysis
          and health information for educational purposes only. It does not provide
          medical diagnoses, treatment recommendations, or replace professional
          medical advice. Always consult with qualified healthcare professionals.
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2026 CareBridge. AI-Powered Healthcare Document Intelligence.</p>
          <p className="mt-2 text-sm">HIPAA Compliant | SOC 2 Type II | FHIR R4</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-6 hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
