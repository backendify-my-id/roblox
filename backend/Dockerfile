# Build stage
FROM golang:1.25.5-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the application
RUN go build -o main .

# Run stage
FROM alpine:latest

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/main .
# Copy .env if needed (though environment variables are preferred in Docker)
COPY --from=builder /app/.env .

# Install ca-certificates for HTTPS requests to Roblox API
RUN apk --no-cache add ca-certificates

# Expose the port the app runs on
EXPOSE 7000

# Command to run the application
CMD ["./main"]
