package router

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/gin-gonic/gin"
)

// requireTicketSystemEnabled applies the same master-switch check (and error
// shape) as controller.CreateTicket's first-line guard, but as route
// middleware so the upload endpoint rejects before receiving any object data.
// Admin ticket routes stay ungated by design — see the rationale on
// controller.AdminCreateTicket.
func requireTicketSystemEnabled(c *gin.Context) {
	if !ticket_setting.Enabled() {
		common.ApiErrorMsg(c, "the ticket system is currently disabled")
		c.Abort()
		return
	}
	c.Next()
}

// registerTicketRoutes wires the user-facing /tickets group (ownership-scoped,
// no authz permission needed — a user always acts on their own resource) and
// the staff-facing /admin/tickets + /admin/ticket/settings groups (permission
// -gated via authz.TicketRead/Reply/Manage/SettingsWrite).
func registerTicketRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.GET("/ticket-attachments/:public_id", controller.ServeTicketAttachment)
	apiRouter.GET("/tickets/download",
		middleware.UserAuth(),
		controller.DownloadMyTicketAttachment,
	)
	ticketRoute := apiRouter.Group("/tickets")
	ticketRoute.Use(middleware.UserAuth())
	{
		ticketRoute.POST("/", middleware.CriticalRateLimit(), controller.CreateTicket)
		ticketRoute.GET("/", controller.ListMyTickets)
		ticketRoute.GET("/stats", controller.GetMyTicketStats)
		ticketRoute.GET("/capabilities", controller.GetTicketCapabilities)
		ticketRoute.GET("/unread-count", controller.GetMyTicketUnreadCount)
		ticketRoute.POST("/upload", middleware.CriticalRateLimit(), requireTicketSystemEnabled, controller.UploadTicketAttachment)
		ticketRoute.GET("/:public_id", controller.GetMyTicket)
		ticketRoute.GET("/:public_id/messages", controller.ListMyTicketMessages)
		ticketRoute.POST("/:public_id/messages", middleware.CriticalRateLimit(), controller.ReplyMyTicket)
		ticketRoute.POST("/:public_id/read", controller.MarkMyTicketRead)
		ticketRoute.POST("/:public_id/resolve", controller.ResolveMyTicket)
		ticketRoute.POST("/:public_id/reopen", controller.ReopenMyTicket)
	}

	apiRouter.GET("/admin/tickets/download",
		middleware.AdminAuth(),
		middleware.RequirePermission(authz.TicketRead),
		controller.DownloadTicketAttachmentAdmin,
	)

	adminTicketRoute := apiRouter.Group("/admin/tickets")
	adminTicketRoute.Use(middleware.AdminAuth())
	for _, route := range adminTicketPermissionRoutes {
		adminTicketRoute.Handle(route.method, route.path,
			middleware.RequirePermission(route.permission),
			route.handler,
		)
	}
	adminTicketSettingsRoute := apiRouter.Group("/admin/ticket/settings")
	adminTicketSettingsRoute.Use(middleware.AdminAuth())
	{
		adminTicketSettingsRoute.GET("/", middleware.RequirePermission(authz.TicketSettingsWrite), controller.GetTicketSettings)
		adminTicketSettingsRoute.PUT("/", middleware.RequirePermission(authz.TicketSettingsWrite), controller.UpdateTicketSettings)
	}
}

var adminTicketPermissionRoutes = []permissionRoute{
	{method: http.MethodGet, path: "/", permission: authz.TicketRead, handler: controller.ListAllTickets},
	{method: http.MethodGet, path: "/trash", permission: authz.TicketDelete, handler: controller.ListDeletedTicketsAdmin},
	{method: http.MethodPost, path: "/trash/:public_id/restore", permission: authz.TicketDelete, handler: controller.RestoreTicketAdmin},
	{method: http.MethodGet, path: "/stats", permission: authz.TicketRead, handler: controller.GetTicketStatsAdmin},
	{method: http.MethodGet, path: "/unread-count", permission: authz.TicketRead, handler: controller.GetTicketUnreadCountAdmin},
	{method: http.MethodPost, path: "/upload", permission: authz.TicketReply, handler: controller.UploadTicketAttachment},
	{method: http.MethodPost, path: "/", permission: authz.TicketManage, handler: controller.AdminCreateTicket},
	{method: http.MethodGet, path: "/:public_id", permission: authz.TicketRead, handler: controller.GetTicketAdmin},
	{method: http.MethodGet, path: "/:public_id/messages", permission: authz.TicketRead, handler: controller.ListTicketMessagesAdmin},
	{method: http.MethodPost, path: "/:public_id/messages", permission: authz.TicketReply, handler: controller.ReplyTicketAdmin},
	{method: http.MethodPost, path: "/:public_id/read", permission: authz.TicketRead, handler: controller.MarkTicketReadAdmin},
	{method: http.MethodPost, path: "/:public_id/resolve", permission: authz.TicketManage, handler: controller.ResolveTicketAdmin},
	{method: http.MethodPost, path: "/:public_id/reopen", permission: authz.TicketManage, handler: controller.ReopenTicketAdmin},
	{method: http.MethodPost, path: "/:public_id/assign", permission: authz.TicketManage, handler: controller.AssignTicketAdmin},
	{method: http.MethodDelete, path: "/:public_id", permission: authz.TicketDelete, handler: controller.DeleteTicketAdmin},
	{method: http.MethodPost, path: "/:public_id/tags", permission: authz.TicketManage, handler: controller.AddTicketTagsAdmin},
	{method: http.MethodDelete, path: "/:public_id/tags/:tag", permission: authz.TicketManage, handler: controller.RemoveTicketTagAdmin},
	{method: http.MethodPost, path: "/bulk/resolve", permission: authz.TicketManage, handler: controller.BulkResolveTicketsAdmin},
	{method: http.MethodPost, path: "/bulk/assign", permission: authz.TicketManage, handler: controller.BulkAssignTicketsAdmin},
	{method: http.MethodPost, path: "/bulk/tags", permission: authz.TicketManage, handler: controller.BulkTagTicketsAdmin},
}
