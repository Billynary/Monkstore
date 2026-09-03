# Build context is the repository root.
#
# Build the Vite app, then serve it with nginx, which also proxies /api.
FROM node:22-slim AS build
WORKDIR /app
COPY apps/web/package.json ./
RUN npm install
COPY apps/web/tsconfig.json apps/web/vite.config.ts ./
COPY apps/web/src ./src
COPY apps/web/public ./public
COPY apps/web/*.html ./
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
