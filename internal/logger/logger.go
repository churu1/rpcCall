package logger

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

var (
	file   *os.File
	Logger *log.Logger
)

func Init() error {
	execPath, err := os.Executable()
	if err != nil {
		execPath, _ = os.Getwd()
	}
	// .app bundle: Contents/MacOS/RpcCall -> go up 3 levels to .app's parent
	projectDir := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(execPath))))
	// If running via `wails dev` or `go run`, use cwd
	if _, err := os.Stat(filepath.Join(projectDir, "go.mod")); err != nil {
		projectDir, _ = os.Getwd()
	}
	logDir := filepath.Join(projectDir, "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return err
	}

	logPath := filepath.Join(logDir, "rpccall.log")
	file, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return err
	}

	Logger = log.New(file, "", log.Ldate|log.Ltime|log.Lshortfile)
	Logger.Println("=== RpcCall started at", time.Now().Format(time.RFC3339), "===")
	fmt.Println("[RpcCall] Log file:", logPath)

	return nil
}

func Info(format string, v ...interface{}) {
	if Logger != nil {
		Logger.Printf("[INFO] "+format, v...)
	}
}

func Error(format string, v ...interface{}) {
	if Logger != nil {
		Logger.Printf("[ERROR] "+format, v...)
	}
}

func Close() {
	if file != nil {
		file.Close()
	}
}
