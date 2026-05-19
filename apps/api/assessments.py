from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.serializers.assessments import (
    AssessmentSerializer,
    AssessmentScoreEntrySerializer,
    ScheduleGradingComponentSerializer,
)
from apps.services.assessments_service import (
    apply_assessment_filters,
    bulk_save_assessment_scores,
    delete_or_deactivate_assessment,
    get_assessment_records_with_scores,
    get_assessment_queryset_for_user,
    get_components_for_schedule,
    resolve_schedule_for_user,
)


class AssessmentListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_assessment_queryset_for_user(request.user).order_by(
            "-date_given",
            "-id",
        )
        return apply_assessment_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = AssessmentSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AssessmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        assessment = serializer.save()
        out = AssessmentSerializer(assessment, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class AssessmentDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_assessment_queryset_for_user(request.user).filter(id=pk).first()

    def get(self, request, pk):
        assessment = self.get_object(request, pk)
        if assessment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AssessmentSerializer(assessment, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        assessment = self.get_object(request, pk)
        if assessment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AssessmentSerializer(
            assessment,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        assessment = serializer.save()
        out = AssessmentSerializer(assessment, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        assessment = self.get_object(request, pk)
        if assessment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        action = delete_or_deactivate_assessment(assessment)
        if action == "deactivated":
            return Response(
                {
                    "action": "deactivated",
                    "message": "This assessment already has scores and cannot be deleted.",
                },
                status=status.HTTP_200_OK,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScheduleGradingComponentsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, schedule_id):
        schedule = resolve_schedule_for_user(request.user, schedule_id)
        template, components = get_components_for_schedule(request.user, schedule)
        payload = [
            {
                "id": item.id,
                "name": item.type,
                "weight": item.weight,
                "order": item.order,
            }
            for item in components
        ]
        serializer = ScheduleGradingComponentSerializer(payload, many=True)
        return Response(
            {
                "schedule_id": schedule.id,
                "template_id": template.id,
                "template_name": template.name,
                "components": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class AssessmentScoresAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_assessment(self, request, assessment_id):
        return get_assessment_queryset_for_user(request.user).filter(id=assessment_id).first()

    def get(self, request, assessment_id):
        assessment = self.get_assessment(request, assessment_id)
        if assessment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        rows = get_assessment_records_with_scores(assessment)
        serializer = AssessmentScoreEntrySerializer(rows, many=True)
        entered_count = sum(1 for row in rows if row["score"] is not None)
        return Response(
            {
                "assessment_id": assessment.id,
                "assessment_title": assessment.title,
                "max_score": assessment.max_score,
                "schedule_display": f"{assessment.schedule.subject.name} - {assessment.schedule.section.name}",
                "rows": serializer.data,
                "summary": {
                    "student_count": len(rows),
                    "entered_count": entered_count,
                    "pending_count": max(len(rows) - entered_count, 0),
                },
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, assessment_id):
        assessment = self.get_assessment(request, assessment_id)
        if assessment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        payload = request.data
        items = None
        if isinstance(payload, list):
            items = payload
        elif isinstance(payload, dict):
            items = payload.get("items")
            if items is None:
                items = payload.get("scores")

        if items is None:
            return Response(
                {"detail": "Expected a list of score records."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows, summary = bulk_save_assessment_scores(assessment, items)
        serializer = AssessmentScoreEntrySerializer(rows, many=True)
        return Response(
            {
                "assessment_id": assessment.id,
                "rows": serializer.data,
                "summary": summary,
            },
            status=status.HTTP_200_OK,
        )
