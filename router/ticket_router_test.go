package router

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddTicketTagsAdminRequiresManagePermission(t *testing.T) {
	assertTicketRoutePermission(t, http.MethodPost, "/:public_id/tags", authz.TicketManage, controller.AddTicketTagsAdmin)
	assertTicketRoutePermission(t, http.MethodDelete, "/:public_id/tags/:tag", authz.TicketManage, controller.RemoveTicketTagAdmin)
}

func TestBulkTicketRoutesRequireManagePermission(t *testing.T) {
	assertTicketRoutePermission(t, http.MethodPost, "/bulk/resolve", authz.TicketManage, controller.BulkResolveTicketsAdmin)
	assertTicketRoutePermission(t, http.MethodPost, "/bulk/assign", authz.TicketManage, controller.BulkAssignTicketsAdmin)
	assertTicketRoutePermission(t, http.MethodPost, "/bulk/tags", authz.TicketManage, controller.BulkTagTicketsAdmin)
}

func TestTicketDeleteAndTrashRoutesRequireDeletePermission(t *testing.T) {
	assertTicketRoutePermission(t, http.MethodDelete, "/:public_id", authz.TicketDelete, controller.DeleteTicketAdmin)
	assertTicketRoutePermission(t, http.MethodGet, "/trash", authz.TicketDelete, controller.ListDeletedTicketsAdmin)
	assertTicketRoutePermission(t, http.MethodPost, "/trash/:public_id/restore", authz.TicketDelete, controller.RestoreTicketAdmin)
}

func TestTicketRoutesRegisterWithoutConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	api := engine.Group("/api")

	require.NotPanics(t, func() {
		registerTicketRoutes(api)
	})
}

func assertTicketRoutePermission(t *testing.T, method string, path string, permission authz.Permission, handler any) {
	t.Helper()
	for _, route := range adminTicketPermissionRoutes {
		if route.method == method && route.path == path {
			assert.Equal(t, permission, route.permission)
			assert.Equal(t, reflect.ValueOf(handler).Pointer(), reflect.ValueOf(route.handler).Pointer())
			return
		}
	}
	t.Fatalf("route %s %s not found", method, path)
}
