# CareBridge User Manual

## Getting Started

### Creating an Account

1. Navigate to the CareBridge login page
2. Contact your system administrator to create an account in Keycloak
3. You will receive credentials (username and password)
4. Log in with your credentials

### Dashboard Overview

After logging in, you'll see the main dashboard with:
- **Stats Cards** - Document count, active conversations, health records, blockchain anchors
- **Quick Actions** - Upload document, start chat, view records
- **Recent Documents** - Your latest uploaded documents

---

## Document Management

### Uploading a Document

1. Navigate to **Documents** → **Upload**
2. Drag and drop your file or click to browse
3. Select the **Document Type**:
   - Lab Result
   - Prescription
   - Radiology Report
   - Clinical Note
   - Insurance Document
   - Other
4. Click **Upload**
5. The system will:
   - Encrypt the document (AES-256-GCM)
   - Extract text via OCR
   - Index content for AI search
   - Anchor to blockchain for integrity

### Viewing Documents

1. Navigate to **Documents**
2. Use filters to search by type or name
3. Click a document to view details
4. Available actions:
   - **Download** - Decrypted original file
   - **Verify** - Check blockchain integrity
   - **Extract Health Data** - AI-powered data extraction
   - **View FHIR** - See FHIR-formatted data

---

## AI Chat

### Starting a Conversation

1. Navigate to **AI Chat**
2. Click **New Conversation**
3. Type your health-related question
4. The AI will:
   - Search your documents for relevant context (RAG)
   - Route to the appropriate expert (lab, medication, radiology, general)
   - Provide an informed response with citations

### Suggested Questions

- "What were my latest blood test results?"
- "Explain my cholesterol levels"
- "What medications am I currently taking?"
- "Summarize my recent lab results"

### Important Notes

> **Medical Disclaimer**: AI responses are for informational purposes only and do not constitute medical advice. Always consult with a qualified healthcare professional for medical decisions.

- The AI **will not** provide diagnoses
- The AI **will not** prescribe medications
- The AI **will** explain medical terms and results
- The AI **will** summarize your health documents

---

## Health Records

### Viewing Health Records

1. Navigate to **Health Records**
2. View extracted health data organized by type:
   - Vital signs
   - Lab results
   - Medications
   - Conditions

### Health Trends

- The trends section shows how your health metrics change over time
- Abnormal values are highlighted with warning badges
- Reference ranges are shown when available

### FHIR Export

1. Click **Export FHIR Bundle**
2. A FHIR R4 compliant JSON Bundle will be downloaded
3. This can be shared with healthcare providers who support FHIR

---

## Blockchain Verification

### Understanding Blockchain Anchoring

Every document uploaded to CareBridge is anchored to the blockchain:
- A cryptographic hash of the document is recorded
- This creates an immutable proof of the document's existence and content
- Any modification to the document can be detected

### Verifying a Document

1. Navigate to a document's detail page
2. Click **Verify Integrity**
3. The system checks the current document hash against the blockchain record
4. **Green checkmark** = Document is unmodified
5. **Red warning** = Document may have been tampered with

### Audit Trail

Navigate to **Blockchain** to see all blockchain events:
- Document anchoring
- Integrity verifications
- Access grants and revocations

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't log in | Contact admin to verify Keycloak account |
| Upload fails | Check file size (max 50MB) and format |
| AI not responding | Verify Google API key is configured |
| Slow OCR | Large documents take longer to process |
| Blockchain verify fails | Document may still be processing |

## Support

Contact your system administrator for technical support.
