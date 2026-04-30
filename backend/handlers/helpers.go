package handlers

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// getUserID safely extracts user_id from JWT claims stored in Locals.
func getUserID(c *fiber.Ctx) (uint, error) {
	raw := c.Locals("user_id")
	if raw == nil {
		return 0, fmt.Errorf("user_id not found in context")
	}

	switch v := raw.(type) {
	case float64:
		return uint(v), nil
	case int:
		return uint(v), nil
	case uint:
		return v, nil
	case int64:
		return uint(v), nil
	default:
		return 0, fmt.Errorf("unexpected user_id type: %T", raw)
	}
}
