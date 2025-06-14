FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p data

# Support both internal (2000) and WAF mode (80) ports
EXPOSE 2000 80

CMD ["npm", "start"]