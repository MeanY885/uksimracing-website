FROM node:18-alpine

# Install certbot for Let's Encrypt
RUN apk add --no-cache certbot

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p data public/uploads/partners public/uploads/leagues public/uploads/news /var/www/certbot

# Expose both HTTP and HTTPS ports
EXPOSE 80 443

CMD ["npm", "start"]