# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app

# Copy production dependencies manifest
COPY --from=builder /usr/src/app/package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy built application from builder stage
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/locales ./locales

# Expose port (if your bot runs a server for webhooks)
EXPOSE 8080

# Default command to run the application
CMD ["node", "build/src/main.js"]
