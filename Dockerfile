FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY js ./js
COPY css ./css
COPY assets ./assets
COPY pages ./pages
COPY index.html ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
EXPOSE 8787
USER node
CMD ["node", "server/index.mjs"]
