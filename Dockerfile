FROM node:18

RUN npm install -g @nestjs/cli ts-node typescript

WORKDIR /app
COPY package*.json /app/
RUN npm install
COPY ./ /app/
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main"]
