from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import Record
from apps.serializers.grading import ComputedGradeSerializer, GradingTemplateSerializer, RecordSerializer
from apps.services.grade_computation_service import compute_overall_grade_map, compute_schedule_period_grades
from apps.services.grading_service import (
    apply_grading_template_filters,
    delete_or_deactivate_template,
    get_grading_template_queryset,
    set_default_template,
)
from apps.services.reports_service import (
    apply_records_filters,
    build_records_csv,
    get_records_queryset_for_user,
    get_weighted_average_rows,
    summarize_attendance_by_schedule,
    summarize_class_performance,
)


class GradingTemplateListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_grading_template_queryset(request.user).order_by(
            "-is_default",
            "-is_active",
            "name",
            "id",
        )
        return apply_grading_template_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = GradingTemplateSerializer(
            queryset,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = GradingTemplateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        out = GradingTemplateSerializer(template, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class GradingTemplateDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_grading_template_queryset(request.user).filter(id=pk).first()

    def get(self, request, pk):
        template = self.get_object(request, pk)
        if template is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = GradingTemplateSerializer(template, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        template = self.get_object(request, pk)
        if template is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = GradingTemplateSerializer(
            template,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        out = GradingTemplateSerializer(template, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        template = self.get_object(request, pk)
        if template is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action = delete_or_deactivate_template(template)
        if action == "deactivated":
            return Response(
                {
                    "action": "deactivated",
                    "message": "This template is already used and was deactivated.",
                },
                status=status.HTTP_200_OK,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class GradingTemplateSetDefaultAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        template = get_grading_template_queryset(request.user).filter(id=pk).first()
        if template is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        set_default_template(template)
        serializer = GradingTemplateSerializer(template, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class GradeComputeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        schedule_id = request.query_params.get("schedule")
        grade_period_id = request.query_params.get("grade_period")
        result = compute_schedule_period_grades(
            request.user,
            schedule_id=schedule_id,
            grade_period_id=grade_period_id,
            persist=False,
        )
        serializer = ComputedGradeSerializer(result["items"], many=True)
        return Response(
            {
                "schedule": result["schedule"].id,
                "grade_period": result["grade_period"].id,
                "items": serializer.data,
                "message": (
                    "Some records are incomplete because scores are missing."
                    if result["has_incomplete"]
                    else "Grades computed."
                ),
            },
            status=status.HTTP_200_OK,
        )


class GradeRecomputeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        schedule_id = request.data.get("schedule")
        grade_period_id = request.data.get("grade_period")
        result = compute_schedule_period_grades(
            request.user,
            schedule_id=schedule_id,
            grade_period_id=grade_period_id,
            persist=True,
        )
        serializer = ComputedGradeSerializer(result["items"], many=True)
        return Response(
            {
                "schedule": result["schedule"].id,
                "grade_period": result["grade_period"].id,
                "items": serializer.data,
                "message": (
                    "Some records are incomplete because scores are missing."
                    if result["has_incomplete"]
                    else "Grades computed."
                ),
            },
            status=status.HTTP_200_OK,
        )


class RecordListAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = apply_records_filters(get_records_queryset_for_user(request.user), request.query_params)
        schedule = queryset.first().schedule if queryset else None
        overall_map = compute_overall_grade_map(request.user, schedule) if schedule else {}
        serializer = RecordSerializer(queryset, many=True, context={"overall_map": overall_map})
        return Response(serializer.data, status=status.HTTP_200_OK)


class RecordDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        record = (
            Record.objects.select_related("student", "schedule__subject", "schedule__section", "grade_period")
            .filter(id=pk, schedule__user=request.user, grade_period__isnull=False)
            .first()
        )
        if record is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        overall_map = compute_overall_grade_map(request.user, record.schedule)
        serializer = RecordSerializer(record, context={"overall_map": overall_map})
        return Response(serializer.data, status=status.HTTP_200_OK)


class RecordExportAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = apply_records_filters(get_records_queryset_for_user(request.user), request.query_params)
        csv_text, filename = build_records_csv(queryset)
        response = HttpResponse(csv_text, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class AttendanceSummaryReportAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = summarize_attendance_by_schedule(
            request.user,
            schedule_id=request.query_params.get("schedule"),
        )
        return Response(summary, status=status.HTTP_200_OK)


class ClassPerformanceReportAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        schedule_id = request.query_params.get("schedule")
        grade_period_id = request.query_params.get("grade_period")
        summary = summarize_class_performance(request.user, schedule_id, grade_period_id)
        return Response(summary, status=status.HTTP_200_OK)


class WeightedAverageReportAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        schedule_id = request.query_params.get("schedule")
        remarks = request.query_params.get("remarks")
        rows = get_weighted_average_rows(request.user, schedule_id=schedule_id, remarks=remarks)
        return Response(rows, status=status.HTTP_200_OK)
