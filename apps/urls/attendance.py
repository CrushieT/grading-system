from django.urls import path

from apps.api.attendance import (
    AttendanceBulkSaveAPIView,
    AttendanceDetailAPIView,
    AttendanceListCreateAPIView,
    AttendanceSummaryAPIView,
)


urlpatterns = [
    path("attendance/", AttendanceListCreateAPIView.as_view(), name="attendance-list"),
    path("attendance/<int:pk>/", AttendanceDetailAPIView.as_view(), name="attendance-detail"),
    path("attendance/bulk-save/", AttendanceBulkSaveAPIView.as_view(), name="attendance-bulk-save"),
    path("attendance/summary/", AttendanceSummaryAPIView.as_view(), name="attendance-summary"),
]
