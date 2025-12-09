FROM node:22-alpine3.23 AS build
ARG SDK_VERSION=latest

# Install build dependencies (sorted alphabetically)
RUN apk update && \
    apk upgrade --available --no-cache && \
    apk add --no-cache bash g++ make openssl python3 && \
    rm -rf /var/cache/apk/*

# Install pnpm globally and configure for monorepos
RUN npm install -g npm@latest pnpm@latest && \
    pnpm config set inject-workspace-packages=true

# Set the working directory
WORKDIR /app
# Set environment to production
ENV NODE_ENV=production
# Copy only the necessary files to install dependencies
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
# Copy only the necessary files for the rest-api package
COPY rest-api/package.json ./rest-api/
COPY rest-api/pnpm-lock.yaml ./rest-api/
# Install dependencies
RUN pnpm --filter rest-api install
# Set the working directory to the rest-api package
WORKDIR /app/rest-api
# If the SDK_VERSION build argument is provided, update the package.json
# Otherwise, keep the default value
RUN if [ "${SDK_VERSION}" != "latest" ]; then \
        pnpm --filter rest-api update @allbridge/bridge-core-sdk@${SDK_VERSION}; \
    else \
        pnpm --filter rest-api update @allbridge/bridge-core-sdk; \
    fi
# Copy the rest of the files
COPY rest-api/src ./src
COPY rest-api/*.json ./
COPY rest-api/pnpm-lock.yaml ./

# Build the app
RUN pnpm --filter rest-api build
# Install only production dependencies
RUN pnpm --filter rest-api --prod deploy pruned
WORKDIR /app/rest-api/pruned
# Remove devDependencies from package.json to prevent false positives in security scanners
RUN node -e "const p=require('./package.json'); delete p.devDependencies; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2));"

# Final stage
FROM node:22-alpine3.23

# Update and install runtime dependencies in single layer
RUN apk update && \
    apk upgrade --available --no-cache && \
    apk add --no-cache openssl && \
    rm -rf /var/cache/apk/*

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/rest-api/pruned/node_modules ./node_modules
COPY --from=build /app/rest-api/pruned/dist ./dist
COPY --from=build /app/rest-api/pruned/public ./public
COPY --from=build /app/rest-api/pruned/package.json ./
RUN adduser -D rest
USER rest

CMD ["node", "dist/main"]