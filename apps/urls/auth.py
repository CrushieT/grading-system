from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.api.auth import LoginAPIView, LogoutAPIView, MeAPIView, RegisterAPIView

urlpatterns = [
    path("login/", LoginAPIView.as_view(), name="token_obtain_pair"),
    path("register/", RegisterAPIView.as_view(), name="register"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutAPIView.as_view(), name="logout"),
    path("me/", MeAPIView.as_view(), name="me"),
]
