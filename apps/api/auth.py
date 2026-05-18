from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.serializers.auth import RegisterSerializer, UsernameOrEmailLoginSerializer
from apps.services.auth_service import issue_tokens, serialize_user


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UsernameOrEmailLoginSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        django_login(request, user)
        request.session.set_expiry(0)

        tokens = issue_tokens(user)
        return Response(
            {
                **tokens,
                "user": serialize_user(user),
            },
            status=status.HTTP_200_OK,
        )


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        user = created["user"]

        django_login(request, user)
        request.session.set_expiry(0)

        tokens = issue_tokens(user)
        return Response(
            {
                "message": "Registration completed.",
                **tokens,
                "user": serialize_user(user),
                "setup": {
                    "school_year": created["school_year"].name,
                    "semester": created["semester"].name,
                    "is_active": created["school_year_semester"].is_active,
                    "grading_template": created["grading_template"].name,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LogoutAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass

        if request.user.is_authenticated:
            django_logout(request)

        return Response({"message": "Logged out."}, status=status.HTTP_200_OK)


class MeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"user": serialize_user(request.user)}, status=status.HTTP_200_OK)
