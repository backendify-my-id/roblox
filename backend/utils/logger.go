package utils

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogBroadcastHook is an optional global hook invoked whenever any message is written to a DailyFileWriter
var LogBroadcastHook func(category string, message string)

// DailyFileWriter is an io.Writer that handles automatic date-based log rotation and terminal mirroring
type DailyFileWriter struct {
	Category string
	mu       sync.Mutex
	file     *os.File
	lastDate string
}

func (w *DailyFileWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	today := time.Now().Format("2006-01-02")
	if w.file == nil || w.lastDate != today {
		if w.file != nil {
			w.file.Close()
		}

		logDir := filepath.Join(".", "uploads", "log", w.Category)
		if err := os.MkdirAll(logDir, 0755); err != nil {
			return 0, err
		}

		filePath := filepath.Join(logDir, today+".log")
		f, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return 0, err
		}
		w.file = f
		w.lastDate = today
	}

	// Mirror to terminal console
	os.Stdout.Write(p)
	n, err = w.file.Write(p)

	if LogBroadcastHook != nil {
		msgStr := string(p)
		go LogBroadcastHook(w.Category, msgStr)
	}

	return n, err
}

var (
	StartupWriter   = &DailyFileWriter{Category: "startup"}
	CronWriter      = &DailyFileWriter{Category: "cron"}
	WebSocketWriter = &DailyFileWriter{Category: "websocket"}
	ChatSyncWriter   = &DailyFileWriter{Category: "chatsync"}
)

// LogStartup writes to console and uploads/log/startup/[date].log
func LogStartup(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	formattedMsg := fmt.Sprintf("[%s] [STARTUP] %s\n", timestamp, msg)
	StartupWriter.Write([]byte(formattedMsg))
}

// LogCron menulis entri log yang sangat detail ke konsol dan ke file log harian secara aman.
func LogCron(level string, format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	formattedMsg := fmt.Sprintf("[%s] [%s] %s\n", timestamp, level, msg)
	CronWriter.Write([]byte(formattedMsg))
}

// LogWebSocket menulis entri log websocket ke konsol dan ke file websocket.log secara aman.
func LogWebSocket(format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	formattedMsg := fmt.Sprintf("[%s] [WS] %s\n", timestamp, msg)
	WebSocketWriter.Write([]byte(formattedMsg))
}

// LogChatSync writes chat sync progress logs to console and daily log files.
func LogChatSync(level string, format string, v ...interface{}) {
	msg := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	formattedMsg := fmt.Sprintf("[%s] [%s] %s\n", timestamp, level, msg)
	ChatSyncWriter.Write([]byte(formattedMsg))
}

// GetDatabaseLogWriter returns an io.Writer that handles daily database log rotation for GORM
func GetDatabaseLogWriter() io.Writer {
	return &DailyFileWriter{Category: "database"}
}

// GetHTTPLogWriter returns an io.Writer that handles daily access log rotation for Fiber
func GetHTTPLogWriter() io.Writer {
	return &DailyFileWriter{Category: "http"}
}
