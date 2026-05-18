from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import Schedule
from apps.serializers.schedules import PeriodSlotSerializer, ScheduleSerializer
from apps.services.schedules_service import (
    apply_period_search,
    apply_schedule_filters,
    ensure_schedule_period_deletable,
    get_schedule_period_queryset,
)


class PeriodListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_schedule_period_queryset(request.user).order_by("time_start", "name", "id")
        return apply_period_search(queryset, request.query_params.get("search"))

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = PeriodSlotSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = PeriodSlotSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        out = PeriodSlotSerializer(period, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class PeriodDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_schedule_period_queryset(request.user).filter(id=pk).first()

    def get(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PeriodSlotSerializer(period, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = PeriodSlotSerializer(
            period,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        out = PeriodSlotSerializer(period, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_schedule_period_deletable(period)
        period.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScheduleListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = Schedule.objects.select_related(
            "user",
            "subject",
            "section",
            "period",
            "school_year_semester__school_year",
            "school_year_semester__semester",
        ).filter(
            user=request.user,
            school_year_semester__school_year__user=request.user,
            school_year_semester__semester__user=request.user,
        ).order_by("day", "period__time_start", "id")
        return apply_schedule_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = ScheduleSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = ScheduleSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save()
        out = ScheduleSerializer(schedule, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class ScheduleDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return (
            Schedule.objects.select_related(
                "user",
                "subject",
                "section",
                "period",
                "school_year_semester__school_year",
                "school_year_semester__semester",
            )
            .filter(
                id=pk,
                user=request.user,
                school_year_semester__school_year__user=request.user,
                school_year_semester__semester__user=request.user,
            )
            .first()
        )

    def get(self, request, pk):
        schedule = self.get_object(request, pk)
        if schedule is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ScheduleSerializer(schedule, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        schedule = self.get_object(request, pk)
        if schedule is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ScheduleSerializer(
            schedule,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save()
        out = ScheduleSerializer(schedule, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        schedule = self.get_object(request, pk)
        if schedule is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        schedule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
