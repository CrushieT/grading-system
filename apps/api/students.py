from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.models import Section, Subject
from apps.serializers.students import (
    SectionSerializer,
    StudentEnrollmentSerializer,
    StudentSerializer,
    SubjectSerializer,
)
from apps.services.students_service import (
    apply_student_enrollment_filters,
    apply_student_filters,
    apply_section_filters,
    apply_subject_search,
    ensure_enrollment_deletable,
    ensure_section_deletable,
    ensure_student_deletable,
    ensure_subject_deletable,
    get_student_enrollment_queryset_for_user,
    get_student_queryset_for_user,
)


class SubjectListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = Subject.objects.filter(user=request.user).order_by("code", "id")
        return apply_subject_search(queryset, request.query_params.get("search"))

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = SubjectSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SubjectSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        subject = serializer.save()
        out = SubjectSerializer(subject, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SubjectDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return Subject.objects.filter(user=request.user, id=pk).first()

    def get(self, request, pk):
        subject = self.get_object(request, pk)
        if subject is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SubjectSerializer(subject, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        subject = self.get_object(request, pk)
        if subject is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SubjectSerializer(
            subject,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        subject = serializer.save()
        out = SubjectSerializer(subject, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        subject = self.get_object(request, pk)
        if subject is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_subject_deletable(subject)
        subject.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = Section.objects.select_related(
            "school_year_sem__school_year",
            "school_year_sem__semester",
        ).filter(
            school_year_sem__school_year__user=request.user,
            school_year_sem__semester__user=request.user,
        ).order_by("name", "id")
        return apply_section_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = SectionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SectionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        section = serializer.save()
        out = SectionSerializer(section, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class SectionDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return (
            Section.objects.select_related("school_year_sem__school_year", "school_year_sem__semester")
            .filter(
                id=pk,
                school_year_sem__school_year__user=request.user,
                school_year_sem__semester__user=request.user,
            )
            .first()
        )

    def get(self, request, pk):
        section = self.get_object(request, pk)
        if section is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = SectionSerializer(section, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        section = self.get_object(request, pk)
        if section is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = SectionSerializer(
            section,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        section = serializer.save()
        out = SectionSerializer(section, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        section = self.get_object(request, pk)
        if section is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_section_deletable(section)
        section.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_student_queryset_for_user(request.user).order_by("last_name", "first_name", "id")
        return apply_student_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = StudentSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = StudentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        out = StudentSerializer(student, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class StudentDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_student_queryset_for_user(request.user).filter(id=pk).first()

    def get(self, request, pk):
        student = self.get_object(request, pk)
        if student is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = StudentSerializer(student, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, pk):
        student = self.get_object(request, pk)
        if student is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = StudentSerializer(
            student,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        student = serializer.save()
        out = StudentSerializer(student, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        student = self.get_object(request, pk)
        if student is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_student_deletable(student)
        student.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StudentEnrollmentListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        queryset = get_student_enrollment_queryset_for_user(request.user).order_by("-date_enrolled", "-id")
        return apply_student_enrollment_filters(queryset, request.query_params)

    def get(self, request):
        queryset = self.get_queryset(request)
        serializer = StudentEnrollmentSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = StudentEnrollmentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()
        out = StudentEnrollmentSerializer(enrollment, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class StudentEnrollmentDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_student_enrollment_queryset_for_user(request.user).filter(id=pk).first()

    def delete(self, request, pk):
        enrollment = self.get_object(request, pk)
        if enrollment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_enrollment_deletable(enrollment)
        enrollment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
