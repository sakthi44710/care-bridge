#!/bin/bash
# ==============================================================================
# CareBridge AWS Deployment Script
# Deploys CloudFormation stacks in the correct order.
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DB_PASSWORD="${DB_PASSWORD:?Error: DB_PASSWORD environment variable is required}"

echo "============================================="
echo "  CareBridge AWS Deployment - ${ENVIRONMENT}"
echo "  Region: ${AWS_REGION}"
echo "============================================="

deploy_stack() {
    local STACK_NAME=$1
    local TEMPLATE=$2
    shift 2
    local PARAMS=("$@")

    echo ""
    echo ">>> Deploying stack: ${STACK_NAME}"

    aws cloudformation deploy \
        --stack-name "${STACK_NAME}" \
        --template-file "${TEMPLATE}" \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "${AWS_REGION}" \
        --parameter-overrides "${PARAMS[@]}" \
        --tags Key=Project,Value=CareBridge Key=Environment,Value="${ENVIRONMENT}" \
        --no-fail-on-empty-changeset

    echo ">>> Stack ${STACK_NAME} deployed successfully."
}

# Step 1: Network (VPC, Subnets, NAT)
deploy_stack \
    "carebridge-${ENVIRONMENT}-network" \
    "aws/cloudformation/01-network.yml" \
    "EnvironmentName=${ENVIRONMENT}"

# Step 2: Security (SGs, IAM Roles)
deploy_stack \
    "carebridge-${ENVIRONMENT}-security" \
    "aws/cloudformation/02-security.yml" \
    "EnvironmentName=${ENVIRONMENT}"

# Step 3: Data Stores (RDS, Redis, S3)
deploy_stack \
    "carebridge-${ENVIRONMENT}-data" \
    "aws/cloudformation/03-data-stores.yml" \
    "EnvironmentName=${ENVIRONMENT}" \
    "DBMasterPassword=${DB_PASSWORD}"

echo ""
echo "============================================="
echo "  Infrastructure deployed successfully!"
echo "============================================="
echo ""
echo "Next steps:"
echo "  1. Push Docker images to ECR (see CI/CD pipeline)"
echo "  2. Deploy ECS services with:"
echo "     ./aws/deploy-services.sh ${ENVIRONMENT}"
echo "  3. Update secrets in AWS Secrets Manager"
echo ""
echo "Get the RDS endpoint:"
echo "  aws cloudformation describe-stacks --stack-name carebridge-${ENVIRONMENT}-data --query 'Stacks[0].Outputs'"
