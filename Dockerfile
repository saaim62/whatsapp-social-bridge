FROM node:20-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    tesseract-ocr \
    caddy \
    && rm -rf /var/lib/apt/lists/*

# Install PM2 globally
RUN npm install -g pm2

# Create a non-root user (required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Set up working directory
WORKDIR /app
RUN chown user:user /app
USER user

# Copy package files
COPY --chown=user:user package*.json ./
COPY --chown=user:user apps/api/package*.json ./apps/api/
COPY --chown=user:user apps/web/package*.json ./apps/web/

# Install Node dependencies
RUN npm ci

# Copy the rest of the application
COPY --chown=user:user . .

# Generate Prisma client and build applications
RUN cd apps/api && npx prisma generate
RUN npm run build --workspace=apps/api
RUN npm run build --workspace=apps/web

# Expose port 7860 for Hugging Face
EXPOSE 7860

# Make start script executable
RUN chmod +x start_hf.sh

# Start the application
CMD ["./start_hf.sh"]
