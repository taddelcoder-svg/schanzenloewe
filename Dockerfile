FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=10000
COPY package.json server.js zugang.js index.html datenschutz.html ./
COPY js ./js
EXPOSE 10000
CMD ["node", "server.js"]
