# Use official Node.js image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose the app port
EXPOSE 5000

# Start the application
CMD ["node", "server.js"]