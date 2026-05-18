from django.urls import path

from apps.api.setup import (
    GradePeriodDetailAPIView,
    GradePeriodListCreateAPIView,
    SchoolYearDetailAPIView,
    SchoolYearListCreateAPIView,
    SchoolYearSemesterDetailAPIView,
    SchoolYearSemesterListCreateAPIView,
    SemesterDetailAPIView,
    SemesterListCreateAPIView,
)


urlpatterns = [
    path("school-years/", SchoolYearListCreateAPIView.as_view(), name="school-year-list"),
    path("school-years/<int:pk>/", SchoolYearDetailAPIView.as_view(), name="school-year-detail"),
    path("semesters/", SemesterListCreateAPIView.as_view(), name="semester-list"),
    path("semesters/<int:pk>/", SemesterDetailAPIView.as_view(), name="semester-detail"),
    path(
        "school-year-semesters/",
        SchoolYearSemesterListCreateAPIView.as_view(),
        name="school-year-semester-list",
    ),
    path(
        "school-year-semesters/<int:pk>/",
        SchoolYearSemesterDetailAPIView.as_view(),
        name="school-year-semester-detail",
    ),
    path("grade-periods/", GradePeriodListCreateAPIView.as_view(), name="grade-period-list"),
    path("grade-periods/<int:pk>/", GradePeriodDetailAPIView.as_view(), name="grade-period-detail"),
]
