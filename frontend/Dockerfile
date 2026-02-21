## ---- Build Stage ----
FROM node:20-alpine@sha256:5aea3afd07a1d3f5b5a9b5c7d5e9f5a9b5c7d5e9f5a9b5c7d5e9f5a9b5c7d5e AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build-time environment variables (override at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID

RUN npm run build

## ---- Production Stage ----
FROM nginx:alpine@sha256:a8cea48b4d718b5d8b7ce5ed9153d8a64e2f9ee7f0c3c5e5f5a5b5c5d5e5f5a5b AS production

# Copy static export to nginx
COPY --from=builder /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
