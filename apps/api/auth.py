import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.serializers.auth import (
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UpdateMeSerializer,
    UsernameOrEmailLoginSerializer,
)
from apps.services.auth_service import issue_tokens, send_password_reset_email, serialize_user

logger = logging.getLogger(__name__)


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

    def patch(self, request):
        serializer = UpdateMeSerializer(
            instance=request.user,
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Account updated successfully.",
                "user": serialize_user(user),
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]
        user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
        if user:
            try:
                send_password_reset_email(user, request)
            except Exception as exc:
                # Keep response generic for security, but log for troubleshooting.
                logger.exception("Password reset email send failed for user_id=%s email=%s", user.id, user.email)
                if settings.DEBUG:
                    return Response(
                        {"message": f"Password reset email send failed: {exc}"},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

        return Response(
            {
                "message": (
                    "If an account exists for this email, a password reset link has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"message": "Password has been reset successfully."},
            status=status.HTTP_200_OK,
        )
