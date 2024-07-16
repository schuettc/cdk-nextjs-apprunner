# Build stage
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:18-alpine AS builder
WORKDIR /app



# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application in standalone mode
RUN yarn build

# Production stage
FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Copy necessary files from the build stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]