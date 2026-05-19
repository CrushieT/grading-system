from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.serializers.grading import GradingTemplateSerializer
from apps.services.grading_service import (
    apply_grading_template_filters,
    delete_or_deactivate_template,
    get_grading_template_queryset,
    set_default_template,
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
