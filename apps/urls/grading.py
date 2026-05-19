from django.urls import path

from apps.api.grading import (
    GradingTemplateDetailAPIView,
    GradingTemplateListCreateAPIView,
    GradingTemplateSetDefaultAPIView,
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
]
