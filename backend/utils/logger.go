package utils

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	logMu sync.Mutex
)

// LogCron menulis entri log yang sangat detail ke konsol dan ke file log harian secara aman.
func LogCron(level string, format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	now := time.Now()
	timestamp := now.Format("2006-01-02 15:04:05")
	formattedMsg := fmt.Sprintf("[%s] [%s] %s\n", timestamp, level, msg)

	// Tampilkan di konsol terminal
	fmt.Print(formattedMsg)

	// Kunci akses untuk mencegah race condition pada penulisan file
	logMu.Lock()
	defer logMu.Unlock()

	// Buat folder logs di dalam workspace jika belum ada
	// Gunakan path absolut untuk logs agar konsisten terlepas dari di mana program dijalankan
	logDir := filepath.Join(".", "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		log.Printf("Failed to create log directory: %v\n", err)
		return
	}

	// Buat nama file log harian (format: cron_YYYY-MM-DD.log)
	fileName := fmt.Sprintf("cron_%s.log", now.Format("2006-01-02"))
	filePath := filepath.Join(logDir, fileName)

	// Buka file log (buka jika ada, buat jika tidak ada, posisikan cursor di akhir file untuk append)
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Printf("Failed to open cron log file: %v\n", err)
		return
	}
	defer file.Close()

	if _, err := file.WriteString(formattedMsg); err != nil {
		log.Printf("Failed to write to cron log file: %v\n", err)
	}
}
