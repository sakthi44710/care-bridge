"""AI Service using NVIDIA API (Llama 3.1) for medical document intelligence."""
import json
import logging
import time
import base64
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import httpx

from app.config import settings
from app.core.exceptions import AIServiceError

logger = logging.getLogger(__name__)


class ExpertType(str, Enum):
    """Types of medical experts."""
    LAB_ANALYSIS = "lab_analysis"
    MEDICATION = "medication"
    RADIOLOGY = "radiology"
    GENERAL = "general_health"


@dataclass
class AIResponse:
    """AI service response."""
    content: str
    expert_used: str
    model_used: str
    tokens_used: int
    latency_ms: int
    has_document_context: bool = False


class MedicalExpertRouter:
    """
    Routes queries to specialized medical experts based on content analysis.
    Implements a Mixture of Experts (MoE) pattern.
    Adapts response style based on user role (patient vs doctor/clinician).
    """
    
    # ── Patient-facing prompts (simple language, no diagnosis) ──
    PATIENT_EXPERTS = {
        ExpertType.LAB_ANALYSIS: {
            "keywords": [
                "lab", "blood", "test", "result", "hemoglobin", "glucose",
                "cholesterol", "cbc", "metabolic", "panel", "range",
                "normal", "abnormal", "level", "count", "wbc", "rbc",
                "platelet", "creatinine", "bilirubin", "ast", "alt",
            ],
            "system_prompt": """You are a medical lab report analysis assistant speaking to a PATIENT.
Your role is to help patients understand their lab results in simple, clear terms.

Guidelines:
- Explain what each test measures and why it's important
- Indicate whether values are within normal ranges
- Use simple language avoiding medical jargon
- NEVER provide medical diagnosis
- NEVER recommend treatments or medications
- Always advise consulting a healthcare professional for interpretation

When document context is provided, reference specific values from the document.""",
        },
        
        ExpertType.MEDICATION: {
            "keywords": [
                "medication", "drug", "prescription", "dosage", "dose",
                "side effect", "interaction", "pill", "tablet", "capsule",
                "mg", "twice daily", "pharmacy", "refill", "generic",
            ],
            "system_prompt": """You are a medication information assistant speaking to a PATIENT.
Your role is to provide factual information about medications in easy-to-understand language.

Guidelines:
- Explain what medications are used for in simple terms
- Describe common side effects in plain language
- Mention important drug interactions
- NEVER recommend starting, stopping, or changing medications
- NEVER provide dosage recommendations
- Always advise consulting a healthcare professional or pharmacist

When document context is provided, reference specific medications from the document.""",
        },
        
        ExpertType.RADIOLOGY: {
            "keywords": [
                "x-ray", "xray", "ct scan", "ct", "mri", "ultrasound",
                "imaging", "radiology", "scan", "finding", "impression",
                "opacity", "lesion", "nodule", "mass", "fracture",
            ],
            "system_prompt": """You are a radiology report explanation assistant speaking to a PATIENT.
Your role is to help patients understand their imaging reports in simple language.

Guidelines:
- Explain medical terminology in simple terms
- Describe what the imaging shows in layman's terms
- NEVER provide diagnosis from imaging
- NEVER interpret findings as specific conditions
- Always advise consulting a healthcare professional for interpretation

When document context is provided, reference specific findings from the report.""",
        },
        
        ExpertType.GENERAL: {
            "keywords": [],
            "system_prompt": """You are a healthcare document assistant speaking to a PATIENT.
Your role is to help patients understand their medical documents in simple, easy-to-understand language.

Guidelines:
- Explain medical terms in simple language that anyone can understand
- Summarize document contents clearly
- Answer questions about the document
- NEVER provide medical diagnosis
- NEVER recommend treatments
- Always advise consulting healthcare professionals

When document context is provided, base your answers on the document content.""",
        },
    }
    
    # ── Doctor/Clinician-facing prompts (medical terminology, diagnosis suggestions) ──
    DOCTOR_EXPERTS = {
        ExpertType.LAB_ANALYSIS: {
            "keywords": [
                "lab", "blood", "test", "result", "hemoglobin", "glucose",
                "cholesterol", "cbc", "metabolic", "panel", "range",
                "normal", "abnormal", "level", "count", "wbc", "rbc",
                "platelet", "creatinine", "bilirubin", "ast", "alt",
            ],
            "system_prompt": """You are a clinical laboratory analysis assistant for a MEDICAL PROFESSIONAL.
Communicate using precise medical/clinical terminology appropriate for physicians and clinicians.

Guidelines:
- Present lab values with clinical significance and pathophysiological correlations
- Reference standard reference ranges and flag critical values
- Discuss differential diagnoses suggested by abnormal lab patterns
- Suggest additional investigations or confirmatory tests when appropriate
- Correlate findings across multiple lab panels (e.g., CBC with CMP, LFTs with coagulation)
- Note trends and clinical trajectories when serial values are available
- Provide evidence-based diagnostic suggestions with ICD-10 correlations where relevant
- Discuss sensitivity/specificity of relevant biomarkers
- You MAY suggest potential diagnoses and differential diagnoses
- You MAY recommend follow-up investigations and clinical management considerations

When document context is provided, perform thorough clinical analysis of all values.""",
        },
        
        ExpertType.MEDICATION: {
            "keywords": [
                "medication", "drug", "prescription", "dosage", "dose",
                "side effect", "interaction", "pill", "tablet", "capsule",
                "mg", "twice daily", "pharmacy", "refill", "generic",
            ],
            "system_prompt": """You are a clinical pharmacology assistant for a MEDICAL PROFESSIONAL.
Communicate using precise pharmacological and clinical terminology.

Guidelines:
- Discuss pharmacokinetics and pharmacodynamics of medications
- Detail drug-drug interactions with mechanisms of action
- Reference evidence-based dosing guidelines and therapeutic ranges
- Discuss contraindications, black box warnings, and ADR profiles
- Suggest therapeutic alternatives and drug class substitutions when relevant
- Reference relevant clinical guidelines (AHA, ACC, IDSA, etc.)
- Discuss medication reconciliation considerations
- Provide suggestions on dose adjustments for renal/hepatic impairment
- You MAY suggest medication regimen modifications
- You MAY provide clinical decision support for prescribing

When document context is provided, perform comprehensive medication review.""",
        },
        
        ExpertType.RADIOLOGY: {
            "keywords": [
                "x-ray", "xray", "ct scan", "ct", "mri", "ultrasound",
                "imaging", "radiology", "scan", "finding", "impression",
                "opacity", "lesion", "nodule", "mass", "fracture",
            ],
            "system_prompt": """You are a radiology interpretation assistant for a MEDICAL PROFESSIONAL.
Communicate using standard radiological terminology and reporting conventions.

Guidelines:
- Use standardized radiology reporting language (BI-RADS, Lung-RADS, LI-RADS, etc.)
- Discuss imaging findings with differential diagnoses
- Correlate imaging findings with clinical presentation when available
- Suggest additional imaging modalities or follow-up intervals per guidelines
- Reference ACR Appropriateness Criteria when applicable
- Discuss incidental findings and their clinical significance
- Provide structured reporting with impression and recommendations
- You MAY suggest diagnostic possibilities and differential diagnoses
- You MAY recommend follow-up imaging and clinical correlation

When document context is provided, perform systematic radiological analysis.""",
        },
        
        ExpertType.GENERAL: {
            "keywords": [],
            "system_prompt": """You are a clinical decision support assistant for a MEDICAL PROFESSIONAL.
Communicate using precise medical terminology appropriate for physicians and clinicians.

Guidelines:
- Use proper medical nomenclature and clinical terminology
- Provide evidence-based analysis of medical documents
- Discuss differential diagnoses when clinical data is available
- Reference relevant clinical guidelines and standards of care
- Suggest diagnostic workup and investigation pathways
- Discuss prognosis and clinical trajectory when data supports it
- Provide ICD-10 codes and CPT correlations when relevant
- You MAY suggest potential diagnoses and clinical impressions
- You MAY recommend treatment approaches and management strategies
- Include relevant clinical pearls and practice points

When document context is provided, perform comprehensive clinical analysis.""",
        },
    }
    
    def route(self, query: str, has_document: bool = False, user_role: str = "patient") -> Tuple[ExpertType, str]:
        """
        Route query to appropriate expert based on content analysis and user role.
        
        Args:
            query: User's question
            has_document: Whether document context is available
            user_role: User's role (patient, doctor, clinician)
            
        Returns:
            Tuple of (expert_type, system_prompt)
        """
        # Select expert set based on role
        is_medical_professional = user_role in ("doctor", "clinician", "admin")
        experts = self.DOCTOR_EXPERTS if is_medical_professional else self.PATIENT_EXPERTS
        
        query_lower = query.lower()
        scores: Dict[ExpertType, int] = {}
        
        for expert_type, config in experts.items():
            if not config["keywords"]:
                continue
            score = sum(1 for kw in config["keywords"] if kw in query_lower)
            if score > 0:
                scores[expert_type] = score
        
        if scores:
            best_expert = max(scores, key=scores.get)
            logger.info(f"MoE routed to: {best_expert.value} (score: {scores[best_expert]}, role: {user_role})")
            return best_expert, experts[best_expert]["system_prompt"]
        
        return ExpertType.GENERAL, experts[ExpertType.GENERAL]["system_prompt"]


class SafetyGuard:
    """Safety filters for medical AI responses."""
    
    BLOCKED_PATTERNS = [
        "diagnose you with",
        "you have been diagnosed",
        "this confirms you have",
        "take this medication",
        "stop taking your",
        "i prescribe",
        "your treatment should be",
    ]
    
    @staticmethod
    def check_input(query: str) -> Dict[str, Any]:
        """Check if user is asking for diagnosis."""
        diagnosis_keywords = [
            "diagnose", "diagnosis", "what disease", "what condition",
            "am i sick", "do i have", "is it cancer", "prescribe",
        ]
        
        query_lower = query.lower()
        flags = [kw for kw in diagnosis_keywords if kw in query_lower]
        
        return {
            "is_safe": len(flags) == 0,
            "flags": flags,
            "modified_query": None,
        }
    
    @staticmethod
    def sanitize_response(response: str, user_role: str = "patient") -> str:
        """Add medical disclaimer and check for unsafe content."""
        # Check for blocked patterns (only for patient-facing responses)
        if user_role == "patient":
            response_lower = response.lower()
            for pattern in SafetyGuard.BLOCKED_PATTERNS:
                if pattern in response_lower:
                    logger.warning(f"Blocked pattern detected in AI response: {pattern}")
        
        # Add disclaimer for patients only; doctors don't need it
        if user_role in ("doctor", "clinician", "admin"):
            return response
        
        return f"{response}\n\n{settings.MEDICAL_DISCLAIMER}"


class AIService:
    """
    AI service using NVIDIA API (Llama 3.1) for medical document intelligence.
    
    Features:
    - Document-aware responses using OCR context
    - Mixture of Experts routing
    - Medical safety guardrails
    - Conversation history support
    """
    
    def __init__(self):
        """Initialize AI service."""
        self.router = MedicalExpertRouter()
        self.safety = SafetyGuard()
        self._available = bool(settings.NVIDIA_API_KEY)
        
        if not self._available:
            logger.warning("NVIDIA API key not configured - AI features disabled")
        else:
            logger.info(f"AI Service initialized with model: {settings.NVIDIA_MODEL}")
    
    async def _call_nvidia_api(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> Dict[str, Any]:
        """
        Make API call to NVIDIA.
        
        Args:
            messages: List of conversation messages
            system_prompt: System prompt for the model
            model: Model to use (defaults to settings.NVIDIA_MODEL)
            max_tokens: Maximum response tokens
            temperature: Response randomness (0-1)
            
        Returns:
            API response dict with text, tokens, and model
        """
        model = model or settings.NVIDIA_MODEL
        
        # Build API messages
        api_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            role = msg.get("role", "user")
            if role == "model":
                role = "assistant"
            api_messages.append({
                "role": role,
                "content": msg.get("content", "")
            })
        
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                f"{settings.NVIDIA_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": api_messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "top_p": 0.9,
                },
            )
            response.raise_for_status()
            data = response.json()
            
            return {
                "text": data["choices"][0]["message"]["content"],
                "tokens": data.get("usage", {}).get("total_tokens", 0),
                "model": model,
            }
    
    async def chat(
        self,
        query: str,
        document_context: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        user_role: str = "patient",
    ) -> AIResponse:
        """
        Process a chat query with optional document context.
        Adapts response style based on user role.
        
        Args:
            query: User's question
            document_context: OCR text from linked document
            conversation_history: Previous messages in conversation
            user_role: User's role (patient, doctor, clinician)
            
        Returns:
            AIResponse with content and metadata
        """
        start_time = time.time()
        has_document = bool(document_context and document_context.strip())
        is_medical_professional = user_role in ("doctor", "clinician", "admin")
        
        # Safety check (relaxed for medical professionals)
        safety_check = self.safety.check_input(query)
        
        # Route to expert with role awareness
        expert_type, system_prompt = self.router.route(query, has_document, user_role)
        
        # Enhance system prompt with document awareness
        if has_document and is_medical_professional:
            system_prompt += """

IMPORTANT: You have been provided with the patient's medical document.
Perform thorough clinical analysis of this document.
Reference specific values, dates, findings, and clinical correlations.
Provide differential diagnoses where the data supports it.
Suggest additional investigations or follow-up as clinically indicated.
If asked about something not in the document, clearly state that."""
        elif has_document:
            system_prompt += """

IMPORTANT: You have been provided with the user's medical document. 
Use this document to answer their questions accurately.
Reference specific values, dates, and findings from the document.
If asked about something not in the document, clearly state that."""
        
        # Build conversation messages
        messages: List[Dict[str, str]] = []
        
        # Add conversation history (last 10 messages)
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                })
        
        # Build the user message with document context
        user_content = query
        if has_document:
            user_content = f"""Here is the medical document content:

---BEGIN DOCUMENT---
{document_context[:8000]}
---END DOCUMENT---

User's question: {query}

Please answer based on the document content above."""
        
        # Add safety note for patients only
        if not safety_check["is_safe"] and not is_medical_professional:
            user_content += """

Note: I understand you cannot provide medical diagnosis. 
Please explain the relevant medical concepts instead."""
        
        messages.append({"role": "user", "content": user_content})
        
        try:
            if not self._available:
                raise AIServiceError("AI service not configured")
            
            result = await self._call_nvidia_api(messages, system_prompt)
            
            # Apply safety sanitization (role-aware)
            sanitized_content = self.safety.sanitize_response(result["text"], user_role)
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                f"AI response: expert={expert_type.value}, "
                f"has_doc={has_document}, latency={latency_ms}ms"
            )
            
            return AIResponse(
                content=sanitized_content,
                expert_used=expert_type.value,
                model_used=result["model"],
                tokens_used=result["tokens"],
                latency_ms=latency_ms,
                has_document_context=has_document,
            )
            
        except httpx.HTTPStatusError as e:
            logger.error(f"NVIDIA API error: {e.response.status_code} - {e.response.text}")
            raise AIServiceError(f"AI service error: {e.response.status_code}")
        except Exception as e:
            logger.error(f"AI service error: {e}")
            latency_ms = int((time.time() - start_time) * 1000)
            
            return AIResponse(
                content=f"I'm sorry, I encountered an error processing your request. "
                        f"Please try again later.\n\n{settings.MEDICAL_DISCLAIMER}",
                expert_used=expert_type.value,
                model_used=settings.NVIDIA_MODEL,
                tokens_used=0,
                latency_ms=latency_ms,
                has_document_context=has_document,
            )
    
    async def analyze_image(
        self,
        image_data: bytes,
        mime_type: str,
        query: str,
    ) -> AIResponse:
        """
        Analyze a medical image using NVIDIA Vision model.
        
        Args:
            image_data: Raw image bytes
            mime_type: Image MIME type
            query: User's question about the image
            
        Returns:
            AIResponse with analysis
        """
        start_time = time.time()
        
        system_prompt = """You are a medical image analysis assistant.
NEVER provide diagnosis from images.
Only describe what you observe and suggest consulting a healthcare professional."""
        
        try:
            # Encode image to base64
            image_b64 = base64.b64encode(image_data).decode("utf-8")
            
            messages = [{
                "role": "user",
                "content": [
                    {"type": "text", "text": query},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}
                    }
                ]
            }]
            
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    f"{settings.NVIDIA_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.NVIDIA_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.NVIDIA_VISION_MODEL,
                        "messages": [{"role": "system", "content": system_prompt}] + messages,
                        "temperature": 0.3,
                        "max_tokens": 2048,
                    },
                )
                response.raise_for_status()
                data = response.json()
            
            content = self.safety.sanitize_response(
                data["choices"][0]["message"]["content"]
            )
            latency_ms = int((time.time() - start_time) * 1000)
            
            return AIResponse(
                content=content,
                expert_used="radiology",
                model_used=settings.NVIDIA_VISION_MODEL,
                tokens_used=data.get("usage", {}).get("total_tokens", 0),
                latency_ms=latency_ms,
            )
            
        except Exception as e:
            logger.error(f"Image analysis error: {e}")
            return AIResponse(
                content=f"Failed to analyze image.\n\n{settings.MEDICAL_DISCLAIMER}",
                expert_used="radiology",
                model_used=settings.NVIDIA_VISION_MODEL,
                tokens_used=0,
                latency_ms=int((time.time() - start_time) * 1000),
            )
    
    async def extract_health_data(self, ocr_text: str) -> List[Dict[str, Any]]:
        """
        Extract structured health data from OCR text.
        
        Args:
            ocr_text: Extracted text from document
            
        Returns:
            List of structured health records
        """
        if not ocr_text or not self._available:
            return []
        
        prompt = """Extract structured health data from this medical document.
Return a JSON array of objects with these fields:
- record_type: 'observation', 'medication', or 'condition'
- name: name of the test/medication/condition
- value: numeric value if applicable (string)
- unit: unit of measurement
- reference_range_low: lower normal range (number or null)
- reference_range_high: upper normal range (number or null)
- is_abnormal: true/false
- effective_date: date if found (YYYY-MM-DD format or null)

Document text:
{text}

Return ONLY valid JSON array, no other text."""
        
        try:
            messages = [{"role": "user", "content": prompt.format(text=ocr_text[:4000])}]
            result = await self._call_nvidia_api(
                messages,
                "You extract structured medical data accurately. Return only valid JSON.",
                temperature=0.1,
            )
            
            text = result["text"].strip()
            
            # Find JSON array in response
            start = text.find("[")
            end = text.rfind("]") + 1
            if start != -1 and end > start:
                records = json.loads(text[start:end])
                return records if isinstance(records, list) else []
            
            return []
            
        except Exception as e:
            logger.error(f"Health data extraction error: {e}")
            return []


# Global service instance
ai_service = AIService()
