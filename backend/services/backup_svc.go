package services

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
)

// RunDbBackup executes pg_dump and saves the SQL script to destPath
func RunDbBackup(destPath string) error {
	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" { host = "localhost" }
	if user == "" { user = "roblox_user" }
	if password == "" { password = "roblox_password" }
	if dbname == "" { dbname = "roblox_tracker" }
	if port == "" { port = "5432" }

	cmd := exec.Command("pg_dump", "-h", host, "-p", port, "-U", user, "-d", dbname, "-F", "p", "-f", destPath)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return fmt.Errorf("PostgreSQL client tool 'pg_dump' is not installed or not found in system PATH")
		}
		return fmt.Errorf("failed to run pg_dump: %v (details: %s)", err, stderr.String())
	}
	return nil
}
