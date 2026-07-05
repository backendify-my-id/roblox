package handlers

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/apany/roblox-friend-tracker/database"
	"github.com/apany/roblox-friend-tracker/models"
	"github.com/apany/roblox-friend-tracker/services"
	"github.com/gofiber/fiber/v2"
)

func BackupDatabase(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "roblox_user"
	}
	if password == "" {
		password = "roblox_password"
	}
	if dbname == "" {
		dbname = "roblox_tracker"
	}
	if port == "" {
		port = "5432"
	}

	cmd := exec.Command("pg_dump", "-h", host, "-p", port, "-U", user, "-d", dbname, "-F", "p")
	cmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	out, err := cmd.Output()
	if err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'pg_dump' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to run pg_dump: " + err.Error() + " (details: " + stderr.String() + ")",
		})
	}

	filename := fmt.Sprintf("roblox_tracker_backup_%s.sql", time.Now().Format("2006-01-02_15-04-05"))
	c.Set("Content-Disposition", "attachment; filename="+filename)
	c.Set("Content-Type", "application/sql")
	return c.Send(out)
}

func RestoreDatabase(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	file, err := c.FormFile("backup")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to receive uploaded file: " + err.Error()})
	}

	// DoS mitigation: restrict upload size to 50MB
	if file.Size > 50*1024*1024 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Backup file is too large (maximum 50MB)"})
	}

	// Create temp directory if it doesn't exist
	tempDir := "./temp"
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create temp directory"})
	}

	// Save uploaded file
	tempFile := fmt.Sprintf("%s/restore_%d.sql", tempDir, time.Now().UnixNano())
	if err := c.SaveFile(file, tempFile); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save backup file: " + err.Error()})
	}
	defer os.Remove(tempFile)

	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "roblox_user"
	}
	if password == "" {
		password = "roblox_password"
	}
	if dbname == "" {
		dbname = "roblox_tracker"
	}
	if port == "" {
		port = "5432"
	}

	// Step 1: Clean the database by dropping and recreating the public schema
	cleanCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;")
	cleanCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var cleanStderr bytes.Buffer
	cleanCmd.Stderr = &cleanStderr
	if err := cleanCmd.Run(); err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'psql' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clean database: " + err.Error() + " (details: " + cleanStderr.String() + ")",
		})
	}

	// Step 2: Run psql to restore the backup file
	restoreCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-f", tempFile)
	restoreCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var restoreStderr bytes.Buffer
	restoreCmd.Stderr = &restoreStderr
	if err := restoreCmd.Run(); err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "PostgreSQL client tool 'psql' is not installed or not found in system PATH",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to restore database: " + err.Error() + " (details: " + restoreStderr.String() + ")",
		})
	}

	// Step 3: Self-healing reconnect & re-migrate to avoid stale connection prepared statement cache issues
	database.ConnectDB()

	return c.JSON(fiber.Map{"message": "Database successfully restored from backup!"})
}

func ListAutoBackups(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	backupDir := "./uploads/db"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to access backup directory"})
	}

	files, err := os.ReadDir(backupDir)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to read backup files"})
	}

	type BackupFile struct {
		Filename  string    `json:"filename"`
		Size      int64     `json:"size"`
		CreatedAt time.Time `json:"created_at"`
	}

	var backups []BackupFile
	for _, f := range files {
		if f.IsDir() || !strings.HasSuffix(f.Name(), ".sql") {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}

		backups = append(backups, BackupFile{
			Filename:  f.Name(),
			Size:      info.Size(),
			CreatedAt: info.ModTime(),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})

	return c.JSON(backups)
}

func DownloadAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
	}

	c.Set("Content-Disposition", "attachment; filename="+filename)
	c.Set("Content-Type", "application/sql")
	return c.SendFile(path)
}

func DeleteAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
	}

	if err := os.Remove(path); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete backup file: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Backup file deleted successfully"})
}

func TriggerAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	backupDir := "./uploads/db"
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create backup directory"})
	}

	filename := fmt.Sprintf("backup_%s.sql", time.Now().Format("20060102_150405"))
	path := filepath.Join(backupDir, filename)

	if err := services.RunDbBackup(path); err != nil {
		fmt.Printf("[AutoBackup Error] Trigger manual backup failed: %v\n", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Backup failed: " + err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Auto-backup triggered and saved successfully", "filename": filename})
}

func RestoreAutoBackup(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	filename := c.Params("filename")
	if filename == "" || strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid backup filename"})
	}

	path := filepath.Join("./uploads/db", filename)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Backup file not found"})
	}

	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "roblox_user"
	}
	if password == "" {
		password = "roblox_password"
	}
	if dbname == "" {
		dbname = "roblox_tracker"
	}
	if port == "" {
		port = "5432"
	}

	cleanCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;")
	cleanCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var cleanStderr bytes.Buffer
	cleanCmd.Stderr = &cleanStderr
	if err := cleanCmd.Run(); err != nil {
		fmt.Printf("[Restore Error] Failed to drop existing schema: %v (details: %s)\n", err, cleanStderr.String())
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to drop existing schema: " + err.Error() + " (details: " + cleanStderr.String() + ")",
		})
	}

	restoreCmd := exec.Command("psql", "-h", host, "-p", port, "-U", user, "-d", dbname, "-f", path)
	restoreCmd.Env = append(os.Environ(), "PGPASSWORD="+password)

	var restoreStderr bytes.Buffer
	restoreCmd.Stderr = &restoreStderr
	if err := restoreCmd.Run(); err != nil {
		fmt.Printf("[Restore Error] Failed to run restore command: %v (details: %s)\n", err, restoreStderr.String())
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to run restore command: " + err.Error() + " (details: " + restoreStderr.String() + ")",
		})
	}

	return c.JSON(fiber.Map{"message": "Database successfully restored from archive: " + filename})
}

func GetSystemSettings(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var settings []models.SystemSetting
	if err := database.DB.Find(&settings).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch settings"})
	}

	res := make(map[string]interface{})
	for _, s := range settings {
		if s.Key == "global_roblox_cookie" {
			if s.Value != "" {
				res[s.Key] = "********"
			} else {
				res[s.Key] = ""
			}
		} else if s.Type == "boolean" {
			val, _ := strconv.ParseBool(s.Value)
			res[s.Key] = val
		} else if s.Type == "integer" {
			val, _ := strconv.Atoi(s.Value)
			res[s.Key] = val
		} else {
			res[s.Key] = s.Value
		}
	}

	return c.JSON(res)
}

func UpdateSystemSettings(c *fiber.Ctx) error {
	role, ok := c.Locals("role").(string)
	if !ok || role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Forbidden: Admin access required"})
	}

	var input map[string]interface{}
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid input"})
	}

	for k, v := range input {
		valStr := fmt.Sprintf("%v", v)

		// Handle security mask for global_roblox_cookie
		if k == "global_roblox_cookie" {
			if valStr == "********" {
				continue // Skip update if unchanged
			}
			if valStr != "" {
				// Validate Roblox Cookie
				_, _, err := services.ValidateCookie(valStr)
				if err != nil {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cookie Roblox global tidak valid: " + err.Error()})
				}
			}
		}

		if err := services.SetSystemSetting(k, valStr); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Failed to update setting %s", k)})
		}
	}

	return c.JSON(fiber.Map{"message": "Pengaturan sistem berhasil diperbarui"})
}
