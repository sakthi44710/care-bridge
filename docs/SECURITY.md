# CareBridge Security Audit Checklist

## CRITICAL REQUIREMENTS

### 1. Data Protection
- [x] **No unencrypted PHI in logs** - All logging uses sanitized output, no raw document content logged
- [x] **AES-256-GCM encryption** - All documents encrypted at rest using AES-256-GCM via `encryption.py`
- [x] **Key management** - Encryption keys stored in HashiCorp Vault, never in code or config files
- [x] **No private keys in source code** - All secrets loaded from environment variables
- [x] **No exposed encryption keys in frontend** - Frontend only has Firebase public config

### 2. Authentication & Authorization
- [x] **Keycloak OIDC** - Industry-standard identity provider with JWT token verification
- [x] **Role-based access control** - Patient, Provider, Admin roles enforced on every endpoint
- [x] **Token refresh flow** - Automatic token refresh with secure token storage
- [x] **Password policy** - Minimum 8 chars, uppercase, lowercase, digit, special character
- [x] **Brute force protection** - Keycloak lockout after 5 failed attempts

### 3. AI Safety
- [x] **No medical diagnosis** - SafetyGuardrails blocks diagnosis-like queries
- [x] **Medical disclaimer** - Appended to every AI response
- [x] **AI does not prescribe** - Blocked keywords: "diagnose", "prescribe", "you have", "you should take"
- [x] **Expert routing** - MoE router directs queries to appropriate specialist model

### 4. Blockchain Integrity
- [x] **Document anchoring** - SHA-256 hash anchored to blockchain on upload
- [x] **Integrity verification** - Verify before display checks document hasn't been tampered with
- [x] **Immutable audit trail** - All operations logged to BlockchainAudit table
- [x] **Access grant/revoke** - Blockchain-recorded access control changes

### 5. Network Security
- [x] **HTTPS enforced** - Firebase Hosting serves over HTTPS only
- [x] **Security headers** - CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- [x] **CORS restricted** - Only allowed origins (localhost:3000, Firebase domains)
- [x] **No open ports** - Docker services only expose necessary ports

### 6. FHIR Compliance
- [x] **FHIR R4 resources** - Observation, MedicationStatement, Condition, Patient
- [x] **Resource validation** - FHIR resources validated before storage/export
- [x] **Bundle export** - Complete FHIR Bundle export for health records

### 7. Infrastructure
- [x] **Container isolation** - Each service runs in its own Docker container
- [x] **Network segregation** - Docker network isolates backend services
- [x] **Health checks** - All services have health check endpoints
- [x] **Monitoring** - Prometheus metrics + Grafana dashboards
- [x] **Secrets management** - HashiCorp Vault for runtime secrets

## HIPAA Compliance Notes

> **Warning:** This checklist covers technical controls. Full HIPAA compliance also requires:
> - Business Associate Agreements (BAAs)
> - Administrative safeguards (policies, training)
> - Physical safeguards (data center security)
> - Regular risk assessments
> - Incident response procedures
> - Data backup and disaster recovery plans

## Penetration Testing Recommendations

1. Test authentication bypass attempts
2. Test document access control (cross-user access)
3. Test SQL injection on all endpoints
4. Test file upload validation (malicious files)
5. Test AI prompt injection attacks
6. Test blockchain verification bypass
7. Test encryption key extraction
8. Test CORS policy enforcement
