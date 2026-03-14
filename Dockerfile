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
# When served from the same origin, use relative URLs
ENV VITE_API_URL=""
ENV VITE_HUB_URL="/hubs/session"
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
EXPOSE 8080
EXPOSE 5063/udp

ENTRYPOINT ["dotnet", "PulseRealm.Server.dll"]
