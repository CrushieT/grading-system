from django.urls import path

from apps.api.grading import (
    AttendanceSummaryReportAPIView,
    ClassPerformanceReportAPIView,
    GradeComputeAPIView,
    GradeRecomputeAPIView,
    GradingTemplateDetailAPIView,
    GradingTemplateListCreateAPIView,
    GradingTemplateSetDefaultAPIView,
    RecordDetailAPIView,
    RecordExportAPIView,
    RecordListAPIView,
    WeightedAverageReportAPIView,
)


urlpatterns = [
    path(
        "grading-templates/",
        GradingTemplateListCreateAPIView.as_view(),
        name="grading-template-list",
    ),
    path(
        "grading-templates/<int:pk>/",
        GradingTemplateDetailAPIView.as_view(),
        name="grading-template-detail",
    ),
    path(
        "grading-templates/<int:pk>/set-default/",
        GradingTemplateSetDefaultAPIView.as_view(),
        name="grading-template-set-default",
    ),
    path("grades/compute/", GradeComputeAPIView.as_view(), name="grades-compute"),
    path("grades/recompute/", GradeRecomputeAPIView.as_view(), name="grades-recompute"),
    path("records/", RecordListAPIView.as_view(), name="record-list"),
    path("records/<int:pk>/", RecordDetailAPIView.as_view(), name="record-detail"),
    path("records/export/", RecordExportAPIView.as_view(), name="record-export"),
    path(
        "reports/attendance-summary/",
        AttendanceSummaryReportAPIView.as_view(),
        name="report-attendance-summary",
    ),
    path(
        "reports/class-performance/",
        ClassPerformanceReportAPIView.as_view(),
        name="report-class-performance",
    ),
    path(
        "reports/weighted-average/",
        WeightedAverageReportAPIView.as_view(),
        name="report-weighted-average",
    ),
]
