FROM node:22.12-alpine AS build
ARG SDK_VERSION=latest

# Install python and build-base for node-gyp
RUN apk update
RUN apk upgrade --available --no-cache && sync
RUN apk add --no-cache python3 make g++ bash openssl

RUN npm install -g npm@latest
# Install pnpm globally
RUN npm install -g pnpm@latest

# Configure pnpm to work with monorepos
RUN pnpm config set inject-workspace-packages=true

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

RUN pnpm audit --fix
# Build the app
RUN pnpm --filter rest-api build
# Install only production dependencies
RUN pnpm --filter rest-api --prod deploy pruned
WORKDIR /app/rest-api/pruned

# Final stage
FROM node:22.12-alpine
RUN apk update
RUN apk upgrade --available --no-cache && sync
RUN apk add openssl
RUN npm install -g npm@latest
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/rest-api/pruned/node_modules ./node_modules
COPY --from=build /app/rest-api/pruned/dist ./dist
COPY --from=build /app/rest-api/pruned/public ./public
COPY --from=build /app/rest-api/pruned/package.json ./
RUN adduser -D rest
USER rest

CMD ["node", "dist/main"]