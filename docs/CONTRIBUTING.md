# Contributing to CareBridge

## Development Setup

### Prerequisites
- Docker & Docker Compose
- Python 3.11+
- Node.js 18+
- Git

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CareBridge
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Fill in your API keys
   ```

3. **Start infrastructure**
   ```bash
   docker-compose up -d postgres redis minio keycloak vault
   ```

4. **Backend development**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

5. **Frontend development**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Code Standards

### Python (Backend)
- Follow PEP 8
- Use type hints for all function signatures
- Write docstrings for public functions
- Use async/await for I/O operations

### TypeScript (Frontend)
- Use TypeScript strict mode
- Define interfaces for all props and API responses
- Use functional components with hooks
- Follow the existing shadcn/ui component patterns

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure all tests pass
4. Update documentation if needed
5. Submit a PR with a description of changes

## Testing

### Backend Tests
```bash
cd backend
pytest tests/ -v
```

### Frontend Tests
```bash
cd frontend
npm run test
```

## Security

- Never commit secrets or API keys
- Never log PHI or PII
- All new endpoints must have authentication
- Document encryption must not be bypassed
- AI safety guardrails must not be removed
