FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/uploads/encrypted /app/.keys

EXPOSE 5000

CMD ["node", "src/app.js"]
