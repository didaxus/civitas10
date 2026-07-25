FROM node:24-alpine AS production-dependencies

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY backend/ ./
COPY contracts/ /contracts/
COPY scripts/modules/ /scripts/modules/
COPY core/ /core/
COPY scripts/authorization/ /scripts/authorization/
COPY dist/ /dist/

EXPOSE 3000

CMD ["npm", "start"]
