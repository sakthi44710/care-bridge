#!/bin/bash
# ==============================================================================
# CareBridge - Upload secrets from .env.aws to AWS Secrets Manager
# Run this ONCE after deploying infrastructure (deploy-infra.sh)
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-production}"
ENV_FILE="${2:-.env.aws}"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found. Copy .env.aws.example to .env.aws and fill in values."
    exit 1
fi

# Source the env file
set -a
source "$ENV_FILE"
set +a

echo "============================================="
echo "  Uploading secrets to AWS Secrets Manager"
echo "  Environment: ${ENVIRONMENT}"
echo "  Source: ${ENV_FILE}"
echo "============================================="

# Build JSON payload
SECRET_JSON=$(cat <<EOF
{
  "NVIDIA_API_KEY": "${NVIDIA_API_KEY}",
  "GOOGLE_API_KEY": "${GOOGLE_API_KEY}",
  "HF_API_KEY": "${HF_API_KEY}",
  "FIREBASE_PRIVATE_KEY": "${FIREBASE_PRIVATE_KEY}",
  "FIREBASE_PRIVATE_KEY_ID": "${FIREBASE_PRIVATE_KEY_ID}",
  "FIREBASE_CLIENT_EMAIL": "${FIREBASE_CLIENT_EMAIL}",
  "FIREBASE_CLIENT_ID": "${FIREBASE_CLIENT_ID}",
  "FIREBASE_CLIENT_CERT_URL": "${FIREBASE_CLIENT_CERT_URL}",
  "SECRET_KEY": "${SECRET_KEY:-carebridge-aws-production-secret-key}"
}
EOF
)

aws secretsmanager update-secret \
    --secret-id "carebridge/${ENVIRONMENT}/app-secrets" \
    --secret-string "$SECRET_JSON" \
    --region "${AWS_REGION:-us-east-1}"

echo ""
echo ">>> Secrets uploaded successfully!"
echo ">>> Restart ECS services to pick up new values:"
echo "    aws ecs update-service --cluster carebridge-${ENVIRONMENT} --service carebridge-${ENVIRONMENT}-backend --force-new-deployment"
