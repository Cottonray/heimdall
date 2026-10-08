FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /opt/worker
COPY yarn.cjs /tmp/yarn.cjs
COPY browser-worker/package.json browser-worker/yarn.lock browser-worker/.yarnrc.yml ./
RUN node /tmp/yarn.cjs install --immutable
COPY browser-worker/ ./
COPY contracts/ /opt/contracts/
USER pwuser
CMD ["node", "--experimental-strip-types", "worker.ts"]
