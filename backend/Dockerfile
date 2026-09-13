FROM node:22-alpine
WORKDIR /app
COPY backend/package.json ./backend/package.json
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY data ./data
WORKDIR /app/backend
ENV NODE_ENV=production
CMD ["npm", "start"]
