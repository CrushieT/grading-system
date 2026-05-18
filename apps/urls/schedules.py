from django.urls import path

from apps.api.schedules import (
    PeriodDetailAPIView,
    PeriodListCreateAPIView,
    ScheduleDetailAPIView,
    ScheduleListCreateAPIView,
)


urlpatterns = [
    path("periods/", PeriodListCreateAPIView.as_view(), name="period-list"),
    path("periods/<int:pk>/", PeriodDetailAPIView.as_view(), name="period-detail"),
    path("schedules/", ScheduleListCreateAPIView.as_view(), name="schedule-list"),
    path("schedules/<int:pk>/", ScheduleDetailAPIView.as_view(), name="schedule-detail"),
]
