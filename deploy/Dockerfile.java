# Build stage
# 使用非 alpine 镜像以同时支持 amd64（云）和 arm64（Apple Silicon 本地）
FROM gradle:8.7-jdk17 AS builder
WORKDIR /app
COPY xg-backend/ .
RUN gradle :xg-app:bootJar --no-daemon -x test

# Runtime stage
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=builder /app/xg-app/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["sh", "-c", "java ${JAVA_OPTS} -jar app.jar"]
