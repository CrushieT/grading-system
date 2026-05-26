from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import Period, SchoolYear, SchoolYearSemester, Semester
from apps.serializers.setup import (
    GradePeriodSerializer,
    SchoolYearSemesterSerializer,
    SchoolYearSerializer,
    SemesterSerializer,
)
from apps.services.setup_service import (
    ensure_period_deletable,
    ensure_school_year_deletable,
    ensure_school_year_semester_deletable,
    ensure_semester_deletable,
    get_grade_period_queryset,
)


class SchoolYearListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = SchoolYear.objects.filter(user=request.user).order_by("-id")
        serializer = SchoolYearSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SchoolYearSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        school_year = serializer.save()
        out = SchoolYearSerializer(school_year, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SchoolYearDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return SchoolYear.objects.filter(user=request.user, id=pk).first()

    def get(self, request, pk):
        school_year = self.get_object(request, pk)
        if school_year is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SchoolYearSerializer(school_year, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        school_year = self.get_object(request, pk)
        if school_year is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SchoolYearSerializer(
            school_year,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        school_year = serializer.save()
        out = SchoolYearSerializer(school_year, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        school_year = self.get_object(request, pk)
        if school_year is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_school_year_deletable(school_year)
        school_year.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SemesterListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Semester.objects.filter(user=request.user).order_by("id")
        serializer = SemesterSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SemesterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        semester = serializer.save()
        out = SemesterSerializer(semester, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SemesterDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return Semester.objects.filter(user=request.user, id=pk).first()

    def get(self, request, pk):
        semester = self.get_object(request, pk)
        if semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SemesterSerializer(semester, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        semester = self.get_object(request, pk)
        if semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SemesterSerializer(
            semester,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        semester = serializer.save()
        out = SemesterSerializer(semester, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        semester = self.get_object(request, pk)
        if semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_semester_deletable(semester)
        semester.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SchoolYearSemesterListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        return SchoolYearSemester.objects.select_related("school_year", "semester").filter(
            school_year__user=request.user,
            semester__user=request.user,
        ).order_by("-is_active", "school_year__id", "semester__id")

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = SchoolYearSemesterSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SchoolYearSemesterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        school_year_semester = serializer.save()
        out = SchoolYearSemesterSerializer(school_year_semester, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SchoolYearSemesterDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return (
            SchoolYearSemester.objects.select_related("school_year", "semester")
            .filter(
                id=pk,
                school_year__user=request.user,
                semester__user=request.user,
            )
            .first()
        )

    def get(self, request, pk):
        school_year_semester = self.get_object(request, pk)
        if school_year_semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SchoolYearSemesterSerializer(
            school_year_semester,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        school_year_semester = self.get_object(request, pk)
        if school_year_semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SchoolYearSemesterSerializer(
            school_year_semester,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        school_year_semester = serializer.save()
        out = SchoolYearSemesterSerializer(school_year_semester, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        school_year_semester = self.get_object(request, pk)
        if school_year_semester is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_school_year_semester_deletable(school_year_semester)
        school_year_semester.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GradePeriodListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = get_grade_period_queryset(request.user).order_by("position", "id")
        serializer = GradePeriodSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = GradePeriodSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        out = GradePeriodSerializer(period, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class GradePeriodDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_grade_period_queryset(request.user).filter(id=pk).first()

    def get(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = GradePeriodSerializer(period, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = GradePeriodSerializer(
            period,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        period = serializer.save()
        out = GradePeriodSerializer(period, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        period = self.get_object(request, pk)
        if period is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_period_deletable(period)
        period.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
