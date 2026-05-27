# =========================================================
# BUILD STAGE
# =========================================================
FROM maven:3.9.9-eclipse-temurin-17 AS builder

# Install required packages
RUN apt-get update && apt-get install -y \
    curl \
    make \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs

# Working directory
WORKDIR /app

# Copy project files
COPY . .

# Debug info
RUN java -version
RUN mvn -version
RUN node -v
RUN npm -v

# Build application
RUN make build

# =========================================================
# RUNTIME STAGE
# =========================================================
FROM eclipse-temurin:17-jre

WORKDIR /app

# Copy Quarkus runner JAR
COPY --from=builder /app/target/*-runner.jar app.jar

# Expose app port
EXPOSE 8080

# Run app
ENTRYPOINT ["java", "-jar", "app.jar"]