from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.api.auth import (
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    PasswordResetConfirmAPIView,
    PasswordResetRequestAPIView,
    RegisterAPIView,
)

urlpatterns = [
    path("login/", LoginAPIView.as_view(), name="token_obtain_pair"),
    path("register/", RegisterAPIView.as_view(), name="register"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),
    path("me/", MeAPIView.as_view(), name="me"),
    path("password-reset/request/", PasswordResetRequestAPIView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmAPIView.as_view(), name="password-reset-confirm"),
]
