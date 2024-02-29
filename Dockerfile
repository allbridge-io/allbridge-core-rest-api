FROM node:21.6.2-alpine as build
ARG SDK_VERSION=latest

# Install python and build-base for node-gyp
RUN apk add --no-cache python3 make g++ bash
# Install pnpm globally
RUN npm install -g @nestjs/cli

WORKDIR /app
ENV NODE_ENV production
COPY package.json ./
# If the SDK_VERSION build argument is provided, update the package.json
# Otherwise, keep the default value
RUN if [ "${SDK_VERSION}" != "latest" ]; then \
        npm install --save @allbridge/bridge-core-sdk@${SDK_VERSION}; \
    else \
        npm install --save @allbridge/bridge-core-sdk; \
    fi

# Copy the rest of the files
COPY . .

# Build the app
RUN npm run build

FROM node:21.6.2-alpine
WORKDIR /app
ENV NODE_ENV production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package*.json ./

CMD ["node", "dist/main"]

