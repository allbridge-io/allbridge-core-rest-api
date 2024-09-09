FROM node:22.4.0-alpine as build
ARG SDK_VERSION=latest

# Install python and build-base for node-gyp
RUN apk update
RUN apk upgrade --available --no-cache && sync
RUN apk add --no-cache python3 make g++ bash openssl
# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app
ENV NODE_ENV production
COPY pnpm-workspace.yaml ./
COPY rest-api/package.json ./rest-api/
WORKDIR /app/rest-api
# If the SDK_VERSION build argument is provided, update the package.json
# Otherwise, keep the default value
RUN if [ "${SDK_VERSION}" != "latest" ]; then \
        pnpm update @allbridge/bridge-core-sdk@${SDK_VERSION}; \
    else \
        pnpm update @allbridge/bridge-core-sdk; \
    fi

# Copy the rest of the files
COPY rest-api/src ./src
COPY rest-api/*.json ./
COPY rest-api/pnpm-lock.yaml ./

# Build the app
RUN pnpm build
# Install only production dependencies
RUN pnpm install --prod

FROM node:22.4.0-alpine
RUN apk update
RUN apk upgrade --available --no-cache && sync
RUN apk add openssl
WORKDIR /app
ENV NODE_ENV production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/rest-api/node_modules ./rest-api/node_modules
COPY --from=build /app/rest-api/dist ./rest-api/dist
COPY --from=build /app/rest-api/public ./rest-api/public
COPY --from=build /app/rest-api/package.json ./rest-api/
WORKDIR /app/rest-api

CMD ["node", "dist/main"]

