# CareBridge AWS Deployment Guide

## Architecture Overview

```
                    ┌──────────────┐
                    │   Route 53   │  (optional custom domain)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │     ALB      │  Application Load Balancer
                    │  (public)    │  HTTPS termination
                    └──┬───────┬───┘
                       │       │
              /api/*   │       │  /*
              /health  │       │
              /docs    │       │
                       │       │
            ┌──────────▼──┐ ┌──▼──────────┐
            │   Backend   │ │  Frontend   │
            │ ECS Fargate │ │ ECS Fargate │
            │  (FastAPI)  │ │  (nginx)    │
            └──────┬──────┘ └─────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
  ┌────▼───┐  ┌───▼────┐  ┌───▼───┐
  │  RDS   │  │ Redis  │  │  S3   │
  │ PgSQL  │  │ Cache  │  │Upload │
  └────────┘  └────────┘  └───────┘
       (private subnets)
```

### AWS Services Used

| Component          | AWS Service             | Replaces            |
|--------------------|-------------------------|---------------------|
| Backend API        | ECS Fargate             | Render / Cloud Run  |
| Frontend           | ECS Fargate (nginx)     | Firebase Hosting    |
| Database           | RDS PostgreSQL 16       | Docker PostgreSQL   |
| Cache              | ElastiCache Redis 7     | Docker Redis        |
| Object Storage     | S3                      | MinIO               |
| Secrets            | Secrets Manager         | Vault               |
| Load Balancer      | ALB                     | -                   |
| Container Registry | ECR                     | -                   |
| Monitoring         | CloudWatch + Container Insights | Prometheus/Grafana |
| CI/CD              | GitHub Actions           | Manual              |

---

## Prerequisites

1. **AWS CLI v2** installed and configured (`aws configure`)
2. **Docker** 24.0+ installed
3. **An AWS account** with appropriate IAM permissions
4. **A GitHub repository** (for CI/CD)

---

## Quick Start (First-Time Setup)

### 1. Deploy Infrastructure

```bash
# Set required variables
export AWS_REGION=us-east-1
export DB_PASSWORD="YourStrongPasswordHere"

# Deploy VPC, security groups, RDS, Redis, S3
chmod +x aws/deploy-infra.sh
./aws/deploy-infra.sh production
```

This creates 3 CloudFormation stacks in order:
- `carebridge-production-network` - VPC, subnets, NAT gateway
- `carebridge-production-security` - Security groups, IAM roles
- `carebridge-production-data` - RDS, ElastiCache, S3, Secrets Manager

### 2. Configure Secrets

After infrastructure is up, update the secrets in AWS Secrets Manager:

```bash
aws secretsmanager update-secret \
  --secret-id carebridge/production/app-secrets \
  --secret-string '{
    "NVIDIA_API_KEY": "your-nvidia-key",
    "GOOGLE_API_KEY": "your-google-key",
    "HF_API_KEY": "your-hf-key",
    "FIREBASE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "FIREBASE_PRIVATE_KEY_ID": "your-key-id",
    "FIREBASE_CLIENT_EMAIL": "firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com",
    "FIREBASE_CLIENT_ID": "your-client-id",
    "FIREBASE_CLIENT_CERT_URL": "https://www.googleapis.com/robot/v1/metadata/x509/...",
    "SECRET_KEY": "your-256-bit-secret"
  }'
```

### 3. Build & Deploy Services

```bash
chmod +x aws/deploy-services.sh
./aws/deploy-services.sh production
```

This will:
- Build Docker images for backend and frontend
- Push them to ECR
- Deploy the ECS services behind an ALB

### 4. Initialize the Database

Connect to RDS and run the schema:

```bash
# Get RDS endpoint
RDS_HOST=$(aws cloudformation describe-stacks \
  --stack-name carebridge-production-data \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseEndpoint'].OutputValue" \
  --output text)

# Use a bastion or ECS exec to run the SQL
# Option 1: Via ECS Exec (requires enabling execute-command on service)
aws ecs execute-command \
  --cluster carebridge-production \
  --task <TASK_ID> \
  --container backend \
  --interactive \
  --command "psql postgresql://carebridge:${DB_PASSWORD}@${RDS_HOST}:5432/carebridge -f /app/init-scripts/01-schema.sql"
```

Or copy the SQL to an EC2 bastion host in the VPC.

---

## CI/CD Pipeline (GitHub Actions)

The pipeline is defined in `.github/workflows/aws-deploy.yml`.

### Setup GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                  | Description                                     |
|-------------------------|-------------------------------------------------|
| `AWS_DEPLOY_ROLE_ARN`   | IAM role ARN for GitHub OIDC (see below)        |
| `API_URL`               | ALB DNS or custom domain (e.g., `https://api.carebridge.com`) |
| `FIREBASE_API_KEY`      | Firebase API key                                |
| `FIREBASE_AUTH_DOMAIN`  | Firebase auth domain                            |
| `FIREBASE_PROJECT_ID`   | Firebase project ID                             |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket                       |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID            |
| `FIREBASE_APP_ID`       | Firebase app ID                                 |

### Setup GitHub OIDC with AWS

Create an IAM role that GitHub Actions can assume:

```bash
# 1. Create OIDC provider (one-time)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 2. Create IAM role with trust policy for your repo
# See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
```

### Trigger Deployment

- **Automatic**: Push to `main` branch
- **Manual**: Go to Actions → "Deploy CareBridge to AWS" → Run workflow

---

## Scaling

### Backend Auto-Scaling

The backend service auto-scales between 1-6 tasks based on CPU utilization (target: 70%). Configured in the CloudFormation template.

To adjust:
```bash
# Update desired count
aws ecs update-service \
  --cluster carebridge-production \
  --service carebridge-production-backend \
  --desired-count 3
```

### Database Scaling

Upgrade RDS instance class:
```bash
aws rds modify-db-instance \
  --db-instance-identifier carebridge-production-db \
  --db-instance-class db.t3.medium \
  --apply-immediately
```

---

## Monitoring

### CloudWatch Logs

```bash
# View backend logs
aws logs tail /ecs/carebridge-production-backend --follow

# View frontend logs
aws logs tail /ecs/carebridge-production-frontend --follow
```

### Health Checks

```bash
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name carebridge-production-ecs \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
  --output text)

curl http://${ALB_DNS}/health
```

---

## Custom Domain (Optional)

1. Register domain or use existing one in **Route 53**
2. Request an **ACM certificate** in the same region:
   ```bash
   aws acm request-certificate \
     --domain-name carebridge.yourdomain.com \
     --validation-method DNS
   ```
3. Validate the certificate via DNS
4. Update the ECS stack with the certificate ARN:
   ```bash
   aws cloudformation deploy \
     --stack-name carebridge-production-ecs \
     --template-file aws/cloudformation/04-ecs-services.yml \
     --parameter-overrides \
       "CertificateArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID" \
       ...other params...
   ```
5. Create a Route 53 ALIAS record pointing to the ALB DNS

---

## Cost Estimate (Monthly)

| Service              | Config             | Est. Cost  |
|----------------------|--------------------|------------|
| ECS Fargate (backend)  | 2 tasks, 0.5 vCPU, 1GB | ~$30    |
| ECS Fargate (frontend) | 2 tasks, 0.25 vCPU, 0.5GB | ~$15 |
| RDS PostgreSQL       | db.t3.micro        | ~$15       |
| ElastiCache Redis    | cache.t3.micro     | ~$13       |
| ALB                  | 1 ALB              | ~$16       |
| NAT Gateway          | 1 NAT              | ~$32       |
| S3                   | <10 GB             | ~$1        |
| ECR                  | <5 GB              | ~$1        |
| CloudWatch           | Basic               | ~$5       |
| **Total**            |                    | **~$128/mo** |

> Tip: For staging/dev, use a single NAT gateway (already configured) and reduce task counts to 1.

---

## Teardown

To delete all resources:

```bash
# Delete in reverse order
aws cloudformation delete-stack --stack-name carebridge-production-ecs
aws cloudformation wait stack-delete-complete --stack-name carebridge-production-ecs

aws cloudformation delete-stack --stack-name carebridge-production-data
aws cloudformation wait stack-delete-complete --stack-name carebridge-production-data

aws cloudformation delete-stack --stack-name carebridge-production-security
aws cloudformation wait stack-delete-complete --stack-name carebridge-production-security

aws cloudformation delete-stack --stack-name carebridge-production-network
aws cloudformation wait stack-delete-complete --stack-name carebridge-production-network
```

> Note: RDS has deletion protection enabled. Disable it first:
> ```bash
> aws rds modify-db-instance --db-instance-identifier carebridge-production-db --no-deletion-protection --apply-immediately
> ```
> S3 bucket must be emptied before deletion.
