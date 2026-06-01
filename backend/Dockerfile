# =====================================================
# VELTRONIK V2 - DOCKERFILE DE PRODUCCIÓN
# =====================================================

# Etapa 1: Compilación (Build Stage)
FROM maven:3.9.6-eclipse-temurin-17 AS builder
WORKDIR /app

# Copiar pom.xml y descargar dependencias (caché de Docker para builds rápidos)
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copiar el código fuente y compilar el JAR
COPY src ./src
RUN mvn package -DskipTests

# =====================================================
# Etapa 2: Ejecución (Runtime Stage - imagen mínima)
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Crear usuario no-root para mayor seguridad (no correr como root en contenedor)
RUN addgroup -S veltronik && adduser -S veltronik -G veltronik

# Copiar el JAR compilado desde la etapa anterior
COPY --from=builder /app/target/*.jar app.jar

# Asignar propiedad al usuario no-root
RUN chown veltronik:veltronik app.jar

# Cambiar al usuario no-root
USER veltronik

# Exponer el puerto de Spring Boot
EXPOSE 8080

# Health check nativo de Docker (Railway también lo usa)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

# Arranque optimizado para contenedores (JVM con memoria ajustada)
# user.timezone: la app representa fechas en hora de Argentina (las columnas son
# 'timestamp without time zone'). Sin esto, el contenedor corre en UTC y el límite
# de día/mes se desplaza hasta 3 h (ingresos, vencimientos y accesos nocturnos).
# Respaldo de TimeZone.setDefault() en el main; ambos apuntan a la misma zona IANA.
ENTRYPOINT ["java", \
  "-XX:+UseG1GC", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Duser.timezone=America/Argentina/Buenos_Aires", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-Dspring.profiles.active=${SPRING_PROFILES_ACTIVE:prod}", \
  "-jar", "app.jar"]
