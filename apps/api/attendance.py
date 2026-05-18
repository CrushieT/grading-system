from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.serializers.attendance import AttendanceSerializer
from apps.services.attendance_service import (
    apply_attendance_filters,
    bulk_save_attendance_for_user,
    get_attendance_queryset_for_user,
    summarize_attendance_for_user,
)


class AttendanceListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_attendance_queryset_for_user(request.user).order_by("-day_time", "-id")
        return apply_attendance_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = AttendanceSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = AttendanceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        attendance = serializer.save()
        out = AttendanceSerializer(attendance, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class AttendanceDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_attendance_queryset_for_user(request.user).filter(id=pk).first()

    def get(self, request, pk):
        attendance = self.get_object(request, pk)
        if attendance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AttendanceSerializer(attendance, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        attendance = self.get_object(request, pk)
        if attendance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = AttendanceSerializer(
            attendance,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        attendance = serializer.save()
        out = AttendanceSerializer(attendance, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        attendance = self.get_object(request, pk)
        if attendance is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        attendance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AttendanceBulkSaveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = request.data
        items = None
        if isinstance(payload, list):
            items = payload
        elif isinstance(payload, dict):
            items = payload.get("items")
            if items is None:
                items = payload.get("records")

        if items is None:
            return Response(
                {"detail": "Expected a list of attendance records."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        saved_records, summary = bulk_save_attendance_for_user(request.user, items)
        serializer = AttendanceSerializer(saved_records, many=True, context={"request": request})
        return Response(
            {
                "records": serializer.data,
                "summary": summary,
            },
            status=status.HTTP_200_OK,
        )


class AttendanceSummaryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = summarize_attendance_for_user(
            request.user,
            student_id=request.query_params.get("student"),
            schedule_id=request.query_params.get("schedule"),
        )
        return Response(summary, status=status.HTTP_200_OK)
