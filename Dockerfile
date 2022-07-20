FROM ethereum/solc:0.8.6 AS solc

FROM node:16.15.0-alpine

COPY --from=solc /usr/bin/solc /usr/bin/solc

WORKDIR /hardhat

#is this even safe bro?
RUN npm -g config set user root

RUN apk update && apk add --no-cache git

COPY package.json ./
COPY contracts /hardhat/contracts
COPY scripts /hardhat/scripts
COPY tasks /hardhat/tasks
COPY hardhat.config.ts /hardhat/hardhat.config.ts
COPY utils.ts /hardhat/utils.ts

RUN npm install

ENTRYPOINT ["npm", "start:docker"]

