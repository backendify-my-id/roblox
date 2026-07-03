# Build stage
FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Run stage
FROM alpine:latest

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/main .

# Install ca-certificates for HTTPS requests to Roblox API, postgresql-client for backups, and tzdata for timezones
RUN apk --no-cache add ca-certificates postgresql-client tzdata

# Expose the port the app runs on
EXPOSE 7000

# Command to run the application
CMD ["./main"]
