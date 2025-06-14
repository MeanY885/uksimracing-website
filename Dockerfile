FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p data

# Default to port 80 for WAF compatibility
EXPOSE 80

CMD ["npm", "start"]