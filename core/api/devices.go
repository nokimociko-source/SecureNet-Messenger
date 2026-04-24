package api

import (
	"net/http"

	"securenet-backend/core/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RegisterDeviceRoutes adds device binding endpoints.
func RegisterDeviceRoutes(group *gin.RouterGroup, deviceSvc *services.DeviceService) {
	// Register device (called on login/app start)
	group.POST("/devices", func(c *gin.Context) {
		if deviceSvc == nil {
			c.JSON(http.StatusOK, gin.H{"status": "demo", "message": "Database unavailable, skipping device registration"})
			return
		}
		userID := c.GetString("userId")
		uid, err := uuid.Parse(userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid userId"})
			return
		}

		var req struct {
			DeviceName  string `json:"deviceName" binding:"required"`
			Platform    string `json:"platform" binding:"required"`
			Fingerprint string `json:"fingerprint" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ipAddress, userAgent := services.GetClientInfo(c)

		device, isNew, err := deviceSvc.RegisterDevice(
			c.Request.Context(), uid, req.DeviceName, req.Fingerprint, req.Platform, userAgent, ipAddress,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"device":    device,
			"isNew":     isNew,
			"trusted":   device.Trusted,
		})
	})

	// List devices for current user
	group.GET("/devices", func(c *gin.Context) {
		userID := c.GetString("userId")
		devices, err := deviceSvc.GetDevices(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, devices)
	})

	// Revoke a device
	group.DELETE("/devices/:deviceId", func(c *gin.Context) {
		userID := c.GetString("userId")
		deviceID := c.Param("deviceId")

		if err := deviceSvc.RevokeDevice(c.Request.Context(), deviceID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Device revoked"})
	})

	// Revoke all other devices
	group.DELETE("/devices", func(c *gin.Context) {
		userID := c.GetString("userId")
		currentDeviceID := c.Query("currentDeviceId")

		if currentDeviceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "currentDeviceId is required"})
			return
		}

		if err := deviceSvc.RevokeOtherDevices(c.Request.Context(), userID, currentDeviceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "All other sessions terminated"})
	})

	// Trust a device
	group.POST("/devices/:deviceId/trust", func(c *gin.Context) {
		userID := c.GetString("userId")
		deviceID := c.Param("deviceId")

		if err := deviceSvc.TrustDevice(c.Request.Context(), deviceID, userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Device trusted successfully"})
	})

	// Validate current device
	group.POST("/devices/validate", func(c *gin.Context) {
		userID := c.GetString("userId")

		var req struct {
			Fingerprint string `json:"fingerprint" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		device, err := deviceSvc.ValidateDevice(c.Request.Context(), userID, req.Fingerprint)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if device == nil {
			c.JSON(http.StatusOK, gin.H{
				"known":   false,
				"trusted": false,
				"message": "Unknown device — verification required",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"known":   true,
			"trusted": device.Trusted,
			"device":  device,
		})
	})
}
