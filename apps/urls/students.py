from django.urls import path

from apps.api.students import (
    SectionDetailAPIView,
    SectionListCreateAPIView,
    StudentDetailAPIView,
    StudentEnrollmentDetailAPIView,
    StudentEnrollmentListCreateAPIView,
    StudentListCreateAPIView,
    SubjectDetailAPIView,
    SubjectListCreateAPIView,
)


urlpatterns = [
    path("subjects/", SubjectListCreateAPIView.as_view(), name="subject-list"),
    path("subjects/<int:pk>/", SubjectDetailAPIView.as_view(), name="subject-detail"),
    path("sections/", SectionListCreateAPIView.as_view(), name="section-list"),
    path("sections/<int:pk>/", SectionDetailAPIView.as_view(), name="section-detail"),
    path("students/", StudentListCreateAPIView.as_view(), name="student-list"),
    path("students/<int:pk>/", StudentDetailAPIView.as_view(), name="student-detail"),
    path(
        "student-enrollments/",
        StudentEnrollmentListCreateAPIView.as_view(),
        name="student-enrollment-list",
    ),
    path(
        "student-enrollments/<int:pk>/",
        StudentEnrollmentDetailAPIView.as_view(),
        name="student-enrollment-detail",
    ),
]
