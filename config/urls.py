
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from core import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # frontend pages
    path('login.html', views.login_page, name='login'),
    path('dashboard.html', views.dashboard_page, name='dashboard'),
]