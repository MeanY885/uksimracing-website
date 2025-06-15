FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p data public/uploads/partners public/uploads/leagues

# Expose both HTTP and HTTPS ports
EXPOSE 80 443

CMD ["npm", "start"]