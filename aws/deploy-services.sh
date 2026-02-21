#!/bin/bash
# ==============================================================================
# CareBridge - Deploy ECS Services
# Builds & pushes Docker images to ECR, then deploys the ECS stack.
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

BACKEND_ECR="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/carebridge-${ENVIRONMENT}-backend"
FRONTEND_ECR="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/carebridge-${ENVIRONMENT}-frontend"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

echo "============================================="
echo "  CareBridge ECS Deployment - ${ENVIRONMENT}"
echo "  Backend:  ${BACKEND_ECR}:${IMAGE_TAG}"
echo "  Frontend: ${FRONTEND_ECR}:${IMAGE_TAG}"
echo "============================================="

# Login to ECR
echo ">>> Logging into ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Build & push backend
echo ">>> Building backend image..."
docker build -t "${BACKEND_ECR}:${IMAGE_TAG}" -t "${BACKEND_ECR}:latest" ./backend
docker push "${BACKEND_ECR}:${IMAGE_TAG}"
docker push "${BACKEND_ECR}:latest"

# Build & push frontend
echo ">>> Building frontend image..."
ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "carebridge-${ENVIRONMENT}-ecs" \
    --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
    --output text 2>/dev/null || echo "localhost")

docker build \
    --build-arg NEXT_PUBLIC_API_URL="https://${ALB_DNS}" \
    --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=care-bridge-ai-334d0 \
    -t "${FRONTEND_ECR}:${IMAGE_TAG}" \
    -t "${FRONTEND_ECR}:latest" \
    ./frontend
docker push "${FRONTEND_ECR}:${IMAGE_TAG}"
docker push "${FRONTEND_ECR}:latest"

# Deploy ECS stack
echo ">>> Deploying ECS services..."
aws cloudformation deploy \
    --stack-name "carebridge-${ENVIRONMENT}-ecs" \
    --template-file "aws/cloudformation/04-ecs-services.yml" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "${AWS_REGION}" \
    --parameter-overrides \
        "EnvironmentName=${ENVIRONMENT}" \
        "BackendImage=${BACKEND_ECR}:${IMAGE_TAG}" \
        "FrontendImage=${FRONTEND_ECR}:${IMAGE_TAG}" \
    --tags Key=Project,Value=CareBridge Key=Environment,Value="${ENVIRONMENT}" \
    --no-fail-on-empty-changeset

echo ""
echo "============================================="
echo "  ECS services deployed successfully!"
echo "============================================="
ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "carebridge-${ENVIRONMENT}-ecs" \
    --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
    --output text)
echo "  Application URL: http://${ALB_DNS}"
echo "  Backend API:     http://${ALB_DNS}/api/v1"
echo "  Health check:    http://${ALB_DNS}/health"
echo "============================================="
