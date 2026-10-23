FROM node:22-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@10.18.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages ./packages
COPY apps ./apps
COPY tsconfig.base.json tsconfig.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 2567
CMD ["pnpm", "--filter", "@game/server", "start"]
