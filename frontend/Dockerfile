FROM node:24-alpine AS build

WORKDIR /app

ARG VITE_API_URL
ARG VITE_LOGTO_ENDPOINT
ARG VITE_LOGTO_APP_ID

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LOGTO_ENDPOINT=$VITE_LOGTO_ENDPOINT
ENV VITE_LOGTO_APP_ID=$VITE_LOGTO_APP_ID

COPY frontend/package*.json ./
RUN npm ci --include=dev

COPY frontend/ ./
COPY config/ /config/
COPY core/ /core/
COPY docs/design-system/ /docs/design-system/

RUN npm run build

FROM nginx:alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
