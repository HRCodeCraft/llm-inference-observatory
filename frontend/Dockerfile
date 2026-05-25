FROM node:20-alpine AS builder

WORKDIR /workspace

# Copy SDK source (build context is repo root)
COPY sdk/ ./sdk/
WORKDIR /workspace/sdk
RUN npm install && npm run build

# Build frontend
WORKDIR /workspace/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /workspace/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
