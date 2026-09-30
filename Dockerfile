FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/booking.db
EXPOSE 3000
CMD ["node", "src/server.js"]
