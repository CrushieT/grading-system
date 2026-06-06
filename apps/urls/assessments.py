from django.urls import path

from apps.api.assessments import (
    AssessmentDetailAPIView,
    AssessmentListCreateAPIView,
    AssessmentScoresAPIView,
    ScheduleGradingComponentsAPIView,
)


urlpatterns = [
    path("assessments/", AssessmentListCreateAPIView.as_view(), name="assessment-list"),
    path("assessments/<int:pk>/", AssessmentDetailAPIView.as_view(), name="assessment-detail"),
    path(
        "assessments/<int:assessment_id>/scores/",
        AssessmentScoresAPIView.as_view(),
        name="assessment-scores",
    ),
    path(
        "schedules/<int:schedule_id>/grading-components/",
        ScheduleGradingComponentsAPIView.as_view(),
        name="schedule-grading-components",
    ),
]
