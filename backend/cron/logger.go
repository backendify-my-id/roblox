package cron

import "github.com/apany/roblox-friend-tracker/utils"

// LogCron menulis entri log ke logger utama di utils.
func LogCron(level string, format string, v ...interface{}) {
	utils.LogCron(level, format, v...)
}
