from django.urls import path

from apps.api.students import (
    SectionDetailAPIView,
    SectionListCreateAPIView,
    SubjectDetailAPIView,
    SubjectListCreateAPIView,
)


urlpatterns = [
    path("subjects/", SubjectListCreateAPIView.as_view(), name="subject-list"),
    path("subjects/<int:pk>/", SubjectDetailAPIView.as_view(), name="subject-detail"),
    path("sections/", SectionListCreateAPIView.as_view(), name="section-list"),
    path("sections/<int:pk>/", SectionDetailAPIView.as_view(), name="section-detail"),
]
