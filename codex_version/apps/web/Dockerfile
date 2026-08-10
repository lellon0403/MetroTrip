FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
RUN npm ci --ignore-scripts
COPY apps/web apps/web
COPY packages packages
ARG API_INTERNAL_BASE_URL=http://api:8000
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ENV API_INTERNAL_BASE_URL=$API_INTERNAL_BASE_URL
ENV NEXT_PUBLIC_KAKAO_JS_KEY=$NEXT_PUBLIC_KAKAO_JS_KEY
RUN npm run build:web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_INTERNAL_BASE_URL=http://api:8000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages ./packages
EXPOSE 3100
CMD ["npm", "run", "start", "--workspace", "@metrotrip/web"]
