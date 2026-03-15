# Stage 1: Build the frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Copy shared types first (frontend depends on them)
COPY shared/ ./shared/

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /app/frontend
RUN npm install

# Copy frontend source and build
COPY frontend/ ./

# Vite embeds these at build time — pass via docker-compose build args
ARG VITE_API_URL=""
ARG VITE_HUB_URL="/hubs/realm"
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_HUB_URL=$VITE_HUB_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

# Stage 2: Build the server
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS server-build
WORKDIR /app
COPY server/*.csproj ./
RUN dotnet restore
COPY server/ ./
RUN dotnet publish -c Release -o /out

# Stage 3: Final runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=server-build /out ./
COPY --from=frontend-build /app/frontend/dist ./wwwroot/

ENV ASPNETCORE_URLS=http://+:8080
ENV SERVER_NAME=PulseRealm
EXPOSE 8080
EXPOSE 5063/udp

ENTRYPOINT ["dotnet", "PulseRealm.Server.dll"]
