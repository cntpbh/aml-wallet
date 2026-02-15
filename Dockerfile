FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip
RUN pip3 install reportlab --break-system-packages

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
